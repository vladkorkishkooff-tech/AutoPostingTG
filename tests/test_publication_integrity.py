from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import db
import main
import scheduler


def test_channel_target_rejects_personal_and_group_ids():
    assert db.is_valid_channel_target("@science_daily")
    assert db.is_valid_channel_target("-1001234567890")
    assert not db.is_valid_channel_target("1866588320")
    assert not db.is_valid_channel_target("-123456789")
    assert not db.is_valid_channel_target("science_daily")


@pytest.mark.asyncio
async def test_ensure_channel_reuses_stable_telegram_identity():
    pool = SimpleNamespace(fetchrow=AsyncMock(return_value={"id": 4}))

    channel_id = await db.ensure_channel(
        pool,
        7,
        "-1001234567890",
        telegram_chat_id=-1001234567890,
        telegram_username="science_daily",
    )

    assert channel_id == 4
    pool.fetchrow.assert_awaited_once()
    assert "telegram_chat_id = $2" in pool.fetchrow.await_args.args[0]


@pytest.mark.asyncio
async def test_ensure_channel_persists_stable_identity_on_first_insert():
    pool = SimpleNamespace(fetchrow=AsyncMock(side_effect=[None, {"id": 9}]))

    channel_id = await db.ensure_channel(
        pool,
        7,
        "@science_daily",
        telegram_chat_id=-1001234567890,
        telegram_username="science_daily",
    )

    assert channel_id == 9
    insert_args = pool.fetchrow.await_args_list[1].args
    assert "telegram_chat_id, telegram_username" in insert_args[0]
    assert insert_args[6:] == (-1001234567890, "science_daily")


@pytest.mark.asyncio
async def test_owner_target_lookup_matches_numeric_alias_to_canonical_channel():
    pool = SimpleNamespace(fetchrow=AsyncMock(return_value={"id": 4, "chat_id": "@science_daily"}))

    channel = await db.channel_for_owner_target(pool, 7, "-1001234567890")

    assert channel == {"id": 4, "chat_id": "@science_daily"}
    assert pool.fetchrow.await_args.args[3] == -1001234567890


def test_confirmed_message_requires_exact_channel():
    sent = SimpleNamespace(
        message_id=42,
        chat=SimpleNamespace(type="channel", id=-1001234567890, username="science_daily", title="Science"),
    )
    assert main._confirmed_message(sent, "@science_daily") == (
        42,
        -1001234567890,
        "Science",
        "https://t.me/science_daily/42",
    )
    with pytest.raises(RuntimeError, match="telegram_target_mismatch"):
        main._confirmed_message(sent, "@another_channel")
    sent.chat.type = "private"
    with pytest.raises(RuntimeError, match="telegram_target_not_channel"):
        main._confirmed_message(sent, "@science_daily")


def test_text_only_post_is_not_truncated_to_caption_limit():
    text = "A" * 1800
    channel = {"telegram_title": "Science", "telegram_username": "science_daily"}
    caption = main._caption(text, channel)
    message = main._text_message(text, channel)
    assert len(caption) <= 1024
    assert len(message) > 1024
    assert len(message) <= 4096
    assert "science_daily" in message


@pytest.mark.asyncio
async def test_channel_verification_rejects_personal_id_without_telegram_call(monkeypatch):
    fake_bot = SimpleNamespace(get_chat=AsyncMock())
    monkeypatch.setattr(main, "bot", fake_bot)
    result = await main.verify_channel_target("1866588320")
    assert result == {"ok": False, "error": "invalid_publication_target"}
    fake_bot.get_chat.assert_not_awaited()


@pytest.mark.asyncio
async def test_channel_verification_requires_posting_permission(monkeypatch):
    fake_bot = SimpleNamespace(
        get_chat=AsyncMock(
            return_value=SimpleNamespace(
                type="channel", id=-1001234567890, username="science_daily", title="Science"
            )
        ),
        get_me=AsyncMock(return_value=SimpleNamespace(id=7)),
        get_chat_member=AsyncMock(
            return_value=SimpleNamespace(status="administrator", can_post_messages=False)
        ),
    )
    monkeypatch.setattr(main, "bot", fake_bot)
    denied = await main.verify_channel_target("@science_daily")
    assert denied == {"ok": False, "error": "bot_cannot_post"}
    fake_bot.get_chat_member.return_value.can_post_messages = True
    allowed = await main.verify_channel_target("@science_daily")
    assert allowed["ok"] is True
    assert allowed["chatId"] == -1001234567890


@pytest.mark.asyncio
async def test_rejected_queued_post_cancels_slot_without_replacement(monkeypatch):
    monkeypatch.setattr(main.db, "get_pool", AsyncMock(return_value=object()))
    monkeypatch.setattr(
        main.db,
        "get_queued_post_for_slot",
        AsyncMock(return_value={"id": 9, "topic": "Марс", "status": "rejected"}),
    )
    publish = AsyncMock()
    monkeypatch.setattr(main, "publish_post", publish)
    notify = AsyncMock()
    monkeypatch.setattr(main, "notify_user", notify)
    result = await main.publish_scheduled(
        {
            "schedule_id": 5,
            "scheduled_at": object(),
            "channel_id": 3,
            "chat_id": "@science_daily",
            "post_time": "12:00",
            "topic": "Марс",
            "mode": "normal",
            "owner_telegram_id": 123,
        }
    )
    assert result.outcome == "cancelled"
    assert result.error_code == "slot_cancelled"
    publish.assert_not_awaited()
    notify.assert_awaited_once()


def test_scheduler_only_loads_verified_channels_and_real_owner():
    query = scheduler._schedule_rows_query()
    assert "c.is_verified" in query
    assert "c.bot_can_post" in query
    assert "u.telegram_id AS owner_telegram_id" in query
    assert "c.user_id" in query
