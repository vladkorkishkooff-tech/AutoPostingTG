"""Postgres (Neon) storage layer for the bot.

Replaces the JSON content history with a proper multi-tenant database.
Falls back gracefully: if DATABASE_URL is not set, main.py keeps using
the legacy JSON ContentHistory.
"""

import logging
import re
import uuid
from datetime import datetime, timezone

import asyncpg

from content_history import text_hash

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None

_PUBLIC_CHANNEL_RE = re.compile(r"^@[A-Za-z0-9_]{5,32}$")
_PRIVATE_CHANNEL_RE = re.compile(r"^-100\d{6,}$")


def is_valid_channel_target(chat_id: str | int) -> bool:
    """Only Telegram channels, never user/group numeric identifiers."""
    value = str(chat_id).strip()
    return bool(_PUBLIC_CHANNEL_RE.fullmatch(value) or _PRIVATE_CHANNEL_RE.fullmatch(value))


async def get_pool(database_url: str) -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(database_url, min_size=1, max_size=5)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def ensure_user(pool: asyncpg.Pool, telegram_id: int, username: str | None = None) -> int:
    row = await pool.fetchrow(
        """
        INSERT INTO users (telegram_id, username)
        VALUES ($1, $2)
        ON CONFLICT (telegram_id)
        DO UPDATE SET username = COALESCE(EXCLUDED.username, users.username), updated_at = now()
        RETURNING id
        """,
        telegram_id,
        username,
    )
    return row["id"]


async def ensure_channel(
    pool: asyncpg.Pool,
    user_id: int,
    chat_id: str,
    *,
    title: str | None = None,
    topic: str = "наука",
    mode: str = "normal",
) -> int:
    if not is_valid_channel_target(chat_id):
        raise ValueError("invalid_publication_target")
    row = await pool.fetchrow(
        """
        INSERT INTO channels (user_id, chat_id, title, topic, mode)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, chat_id)
        DO UPDATE SET title = COALESCE(EXCLUDED.title, channels.title)
        RETURNING id
        """,
        user_id,
        str(chat_id),
        title,
        topic,
        mode,
    )
    return row["id"]


async def claim_slot(pool: asyncpg.Pool, schedule_id: int, slot_key: str) -> bool:
    """Атомарно «занимает» слот расписания (идемпотентность публикаций).

    Возвращает True, если слот занят именно этим процессом. False — слот
    уже обработан (другим процессом или до рестарта). Защищает от двойной
    публикации при рестарте бота или случайном запуске двух экземпляров.
    """
    result = await pool.execute(
        """
        INSERT INTO slot_runs (schedule_id, slot_key)
        VALUES ($1, $2)
        ON CONFLICT (schedule_id, slot_key) DO NOTHING
        """,
        schedule_id,
        slot_key,
    )
    return result.endswith("1")


async def mark_slot_status(pool: asyncpg.Pool, schedule_id: int, slot_key: str, status: str) -> None:
    await pool.execute(
        "UPDATE slot_runs SET status = $3 WHERE schedule_id = $1 AND slot_key = $2",
        schedule_id,
        slot_key,
        status,
    )


async def cleanup_slot_runs(pool: asyncpg.Pool, keep_days: int = 14) -> None:
    """Удаляет старые записи slot_runs, чтобы таблица не росла бесконечно."""
    await pool.execute(
        "DELETE FROM slot_runs WHERE created_at < now() - ($1 || ' days')::interval",
        str(keep_days),
    )


# ---------- Настройка через бота (команды /setup и др.) ----------


async def owner_channels(pool: asyncpg.Pool, user_id: int) -> list[dict]:
    """Каналы владельца с настройками — для команд бота."""
    rows = await pool.fetch(
        """
        SELECT id, chat_id, title, topic, mode, image_policy, is_active,
               is_verified, telegram_chat_id, telegram_title, telegram_username,
               bot_can_post, verified_at, verification_error
        FROM channels
        WHERE user_id = $1
        ORDER BY id
        """,
        user_id,
    )
    return [dict(r) for r in rows]


async def channel_for_owner_target(
    pool: asyncpg.Pool, user_id: int, chat_id: str | int
) -> dict | None:
    row = await pool.fetchrow(
        "SELECT id, chat_id FROM channels WHERE user_id = $1 AND chat_id = $2",
        user_id,
        str(chat_id),
    )
    return dict(row) if row else None


async def update_channel_field(
    pool: asyncpg.Pool,
    channel_id: int,
    field: str,
    value: str,
) -> None:
    """Обновляет одно из настраиваемых полей канала (whitelist)."""
    allowed = {"topic", "mode", "image_policy", "title"}
    if field not in allowed:
        raise ValueError(f"field {field} is not editable")
    await pool.execute(
        f"UPDATE channels SET {field} = $2, updated_at = now() WHERE id = $1",
        channel_id,
        value,
    )


async def schedules_for_channel(pool: asyncpg.Pool, channel_id: int) -> list[dict]:
    rows = await pool.fetch(
        """
        SELECT id, post_time, days_of_week, timezone, is_active, topic, mode
        FROM schedules
        WHERE channel_id = $1
        ORDER BY post_time
        """,
        channel_id,
    )
    return [dict(r) for r in rows]


async def add_schedule_slot(
    pool: asyncpg.Pool,
    channel_id: int,
    post_time: str,
    *,
    topic: str | None = None,
    mode: str | None = None,
) -> int:
    row = await pool.fetchrow(
        """
        INSERT INTO schedules (channel_id, post_time, topic, mode)
        VALUES ($1, $2::time, $3, $4)
        RETURNING id
        """,
        channel_id,
        post_time,
        topic,
        mode,
    )
    return row["id"]


async def delete_schedule_slot(pool: asyncpg.Pool, channel_id: int, post_time: str) -> int:
    """Удаляет слот по времени. Возвращает число удалённых строк."""
    result = await pool.execute(
        "DELETE FROM schedules WHERE channel_id = $1 AND post_time = $2::time",
        channel_id,
        post_time,
    )
    return int(result.split()[-1])


async def pool_topics(pool: asyncpg.Pool, channel_id: int) -> list[dict]:
    rows = await pool.fetch(
        """
        SELECT id, topic, is_active, last_used_at
        FROM topic_pool
        WHERE channel_id = $1
        ORDER BY id
        """,
        channel_id,
    )
    return [dict(r) for r in rows]


async def add_pool_topic(pool: asyncpg.Pool, channel_id: int, topic: str) -> bool:
    """Добавляет тему в пул. False, если такая тема уже есть."""
    result = await pool.execute(
        """
        INSERT INTO topic_pool (channel_id, topic)
        VALUES ($1, $2)
        ON CONFLICT (channel_id, topic) DO NOTHING
        """,
        channel_id,
        topic,
    )
    return result.endswith("1")


async def delete_pool_topic(pool: asyncpg.Pool, channel_id: int, topic_id: int) -> int:
    result = await pool.execute(
        "DELETE FROM topic_pool WHERE channel_id = $1 AND id = $2",
        channel_id,
        topic_id,
    )
    return int(result.split()[-1])


async def recent_texts(
    pool: asyncpg.Pool,
    channel_id: int,
    *,
    topic: str | None = None,
    mode: str | None = None,
    limit: int = 20,
) -> list[str]:
    rows = await pool.fetch(
        """
        SELECT text FROM posts
        WHERE channel_id = $1
          AND status = 'published'
          AND ($2::text IS NULL OR topic = $2)
          AND ($3::text IS NULL OR mode = $3)
        ORDER BY created_at DESC
        LIMIT $4
        """,
        channel_id,
        topic,
        mode,
        limit,
    )
    return [r["text"] for r in rows]


async def recent_image_urls(
    pool: asyncpg.Pool,
    channel_id: int,
    *,
    topic: str | None = None,
    limit: int = 30,
) -> set[str]:
    rows = await pool.fetch(
        """
        SELECT image_url FROM posts
        WHERE channel_id = $1
          AND image_url IS NOT NULL
          AND ($2::text IS NULL OR topic = $2)
        ORDER BY created_at DESC
        LIMIT $3
        """,
        channel_id,
        topic,
        limit,
    )
    return {r["image_url"] for r in rows}


async def has_text(
    pool: asyncpg.Pool,
    channel_id: int,
    text: str,
) -> bool:
    row = await pool.fetchrow(
        "SELECT 1 FROM posts WHERE channel_id = $1 AND text_hash = $2 LIMIT 1",
        channel_id,
        text_hash(text),
    )
    return row is not None


async def get_channel_settings(pool: asyncpg.Pool, channel_id: int) -> dict | None:
    """Настройки канала: медиа-политика и базовые поля."""
    row = await pool.fetchrow(
        """
        SELECT id, user_id, chat_id, title, topic, mode, image_policy, is_active,
               is_verified, telegram_chat_id, telegram_title, telegram_username,
               bot_can_post, verified_at, verification_error, footer_title, footer_url,
               style_profile
        FROM channels WHERE id = $1
        """,
        channel_id,
    )
    return dict(row) if row else None


async def update_channel_verification(
    pool: asyncpg.Pool,
    channel_id: int,
    *,
    verified: bool,
    telegram_chat_id: int | None = None,
    title: str | None = None,
    username: str | None = None,
    can_post: bool = False,
    error: str | None = None,
) -> None:
    """Persist the last authoritative Telegram verification result."""
    await pool.execute(
        """
        UPDATE channels
        SET is_verified = $2,
            telegram_chat_id = COALESCE($3, telegram_chat_id),
            telegram_title = COALESCE($4, telegram_title),
            telegram_username = COALESCE($5, telegram_username),
            bot_can_post = $6,
            verified_at = now(),
            verification_error = $7,
            is_active = CASE WHEN $2 THEN is_active ELSE false END,
            footer_title = COALESCE(footer_title, $4),
            footer_url = COALESCE(footer_url, CASE WHEN $5 IS NULL THEN NULL ELSE 'https://t.me/' || $5 END),
            updated_at = now()
        WHERE id = $1
        """,
        channel_id,
        verified,
        telegram_chat_id,
        title,
        username,
        can_post,
        error[:120] if error else None,
    )


async def pick_pool_topic(pool: asyncpg.Pool, channel_id: int) -> str | None:
    """Ротация тем: берёт наименее недавно использованную активную тему из пула.

    Возвращает None, если пул пуст — тогда используется тема канала/слота.
    """
    row = await pool.fetchrow(
        """
        UPDATE topic_pool
        SET last_used_at = now()
        WHERE id = (
            SELECT id FROM topic_pool
            WHERE channel_id = $1 AND is_active
            ORDER BY last_used_at NULLS FIRST, id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING topic
        """,
        channel_id,
    )
    return row["topic"] if row else None


async def insert_queued_post(
    pool: asyncpg.Pool,
    channel_id: int,
    *,
    schedule_id: int | None,
    topic: str,
    mode: str,
    text: str,
    image_url: str | None,
    image_source: str | None,
    media_type: str | None,
    scheduled_at: datetime,
) -> int:
    """Кладёт сгенерированный пост в очередь на предпросмотр (status='queued')."""
    row = await pool.fetchrow(
        """
        INSERT INTO posts (channel_id, schedule_id, topic, mode, text, text_hash,
                           image_url, image_source, media_type, status, scheduled_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued', $10)
        RETURNING id
        """,
        channel_id,
        schedule_id,
        topic,
        mode,
        text,
        text_hash(text),
        image_url,
        image_source,
        media_type,
        scheduled_at,
    )
    return row["id"]


async def get_queued_post_for_slot(
    pool: asyncpg.Pool,
    schedule_id: int,
    scheduled_at: datetime,
) -> dict | None:
    """Latest prepared post for a slot, including an explicit rejection.

    Returning rejected is intentional: rejection cancels that schedule run and
    must never be interpreted as permission to generate a replacement.
    """
    row = await pool.fetchrow(
        """
        SELECT id, channel_id, topic, mode, text, image_url, image_source, media_type, status
        FROM posts
        WHERE schedule_id = $1
          AND status IN ('queued', 'approved', 'rejected')
          AND scheduled_at BETWEEN $2::timestamptz - interval '12 hours' AND $2::timestamptz + interval '5 minutes'
        ORDER BY created_at DESC
        LIMIT 1
        """,
        schedule_id,
        scheduled_at,
    )
    return dict(row) if row else None


async def has_queued_post_for_slot(
    pool: asyncpg.Pool,
    schedule_id: int,
    scheduled_at: datetime,
) -> bool:
    """Есть ли уже пост (в любом статусе) для этого слота — защита от повторной генерации."""
    row = await pool.fetchrow(
        """
        SELECT 1 FROM posts
        WHERE schedule_id = $1
          AND scheduled_at BETWEEN $2::timestamptz - interval '2 minutes' AND $2::timestamptz + interval '2 minutes'
        LIMIT 1
        """,
        schedule_id,
        scheduled_at,
    )
    return row is not None


async def mark_post_published(
    pool: asyncpg.Pool,
    post_id: int,
    telegram_message_id: int,
    *,
    telegram_chat_id: int,
    target_channel_title: str | None,
    telegram_message_link: str | None,
) -> None:
    await pool.execute(
        """
        UPDATE posts
        SET status = 'published', published_at = now(), telegram_message_id = $2,
            telegram_chat_id = $3, target_channel_title = $4,
            telegram_message_link = $5, error = NULL, error_code = NULL
        WHERE id = $1
        """,
        post_id,
        telegram_message_id,
        telegram_chat_id,
        target_channel_title,
        telegram_message_link,
    )


async def mark_post_publishing(pool: asyncpg.Pool, post_id: int) -> str | None:
    attempt_id = str(uuid.uuid4())
    result = await pool.execute(
        """
        UPDATE posts
        SET status = 'publishing', publication_attempt_id = $2::uuid,
            publishing_started_at = now(), error = NULL, error_code = NULL
        WHERE id = $1 AND status IN ('queued', 'approved')
        """,
        post_id,
        attempt_id,
    )
    return attempt_id if result.endswith("1") else None


async def post_status(pool: asyncpg.Pool, post_id: int) -> str | None:
    return await pool.fetchval("SELECT status FROM posts WHERE id = $1", post_id)


async def update_post_media(
    pool: asyncpg.Pool,
    post_id: int,
    *,
    image_url: str | None,
    image_source: str | None,
    media_type: str | None,
) -> None:
    await pool.execute(
        "UPDATE posts SET image_url = $2, image_source = $3, media_type = $4 WHERE id = $1",
        post_id,
        image_url,
        image_source,
        media_type,
    )


async def mark_post_failed(
    pool: asyncpg.Pool, post_id: int, error: str, *, error_code: str = "telegram_send_failed"
) -> None:
    await pool.execute(
        "UPDATE posts SET status = 'failed', error = $2, error_code = $3 WHERE id = $1",
        post_id,
        error[:500],
        error_code[:80],
    )


async def insert_publishing_post(
    pool: asyncpg.Pool,
    channel_id: int,
    *,
    topic: str,
    mode: str,
    text: str,
    image_url: str | None,
    image_source: str | None,
    schedule_id: int | None = None,
    media_type: str | None = None,
) -> tuple[int, str]:
    attempt_id = str(uuid.uuid4())
    row = await pool.fetchrow(
        """
        INSERT INTO posts (
            channel_id, topic, mode, text, text_hash, image_url, image_source,
            status, schedule_id, media_type, publication_attempt_id, publishing_started_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'publishing', $8, $9, $10::uuid, now())
        RETURNING id
        """,
        channel_id,
        topic,
        mode,
        text,
        text_hash(text),
        image_url,
        image_source,
        schedule_id,
        media_type,
        attempt_id,
    )
    return row["id"], attempt_id


async def active_channels(pool: asyncpg.Pool) -> list[dict]:
    rows = await pool.fetch(
        "SELECT id, chat_id FROM channels WHERE is_active AND is_verified AND bot_can_post ORDER BY id"
    )
    return [dict(r) for r in rows]


async def record_channel_metric(pool: asyncpg.Pool, channel_id: int, member_count: int) -> None:
    await pool.execute(
        "INSERT INTO channel_metrics (channel_id, member_count) VALUES ($1, $2)",
        channel_id,
        member_count,
    )


async def last_metric_at(pool: asyncpg.Pool, channel_id: int) -> datetime | None:
    row = await pool.fetchrow(
        "SELECT max(captured_at) AS ts FROM channel_metrics WHERE channel_id = $1",
        channel_id,
    )
    return row["ts"] if row else None


async def last_metric_snapshot(pool: asyncpg.Pool, channel_id: int) -> dict | None:
    """Последняя записанная метрика канала: значение и время."""
    row = await pool.fetchrow(
        """
        SELECT member_count, captured_at
        FROM channel_metrics
        WHERE channel_id = $1
        ORDER BY captured_at DESC
        LIMIT 1
        """,
        channel_id,
    )
    return dict(row) if row else None


async def add_published_post(
    pool: asyncpg.Pool,
    channel_id: int,
    *,
    topic: str,
    mode: str,
    text: str,
    image_url: str | None,
    image_source: str | None,
    telegram_message_id: int | None = None,
    schedule_id: int | None = None,
    media_type: str | None = None,
) -> int:
    if telegram_message_id is None:
        raise ValueError("telegram_message_id_required")
    row = await pool.fetchrow(
        """
        INSERT INTO posts (channel_id, topic, mode, text, text_hash, image_url, image_source,
                           status, published_at, telegram_message_id, schedule_id, media_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', $8, $9, $10, $11)
        RETURNING id
        """,
        channel_id,
        topic,
        mode,
        text,
        text_hash(text),
        image_url,
        image_source,
        datetime.now(timezone.utc),
        telegram_message_id,
        schedule_id,
        media_type,
    )
    return row["id"]
