"""Планировщик: исполняет расписания из таблицы schedules.

Каждые 30 секунд:
1. Предгенерация: за PREGEN_MINUTES до слота генерирует пост и кладёт его
   в очередь (posts.status = 'queued'), чтобы владелец успел посмотреть
   и при необходимости отклонить/поправить его в Mini App.
2. Публикация: в момент слота публикует пост из очереди (queued/approved)
   или генерирует новый, только если очередь пуста. Отклонённый пост отменяет
   конкретный слот и никогда не заменяется автоматически.

Тема слота: schedules.topic перекрывает channels.topic. Если у канала
есть активный пул тем (topic_pool), тема берётся из него по ротации.

Защита от двойной публикации — два уровня:
1. In-memory ключи (быстрый путь в рамках одного процесса).
2. Атомарный claim слота в БД (slot_runs) — переживает рестарты и
   защищает от случайного запуска двух экземпляров бота.

Отказоустойчивость: публикация ретраится до PUBLISH_RETRIES раз
с экспоненциальной паузой при временных сбоях Telegram/сети.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import db

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = 30
PREGEN_MINUTES = int(os.getenv("QUEUE_PREGEN_MINUTES", "60") or "60")
PUBLISH_RETRIES = int(os.getenv("PUBLISH_RETRIES", "3") or "3")
RETRY_BASE_SECONDS = 20


def _schedule_rows_query() -> str:
    return """
        SELECT s.id AS schedule_id, s.post_time, s.days_of_week, s.timezone,
               COALESCE(s.topic, c.topic) AS topic,
               COALESCE(s.mode, c.mode) AS mode,
               c.id AS channel_id, c.chat_id, c.image_policy, c.user_id,
               c.title AS channel_title, c.telegram_chat_id, c.telegram_title,
               c.telegram_username, c.verified_at, u.telegram_id AS owner_telegram_id
        FROM schedules s
        JOIN channels c ON c.id = s.channel_id
        JOIN users u ON u.id = c.user_id
        WHERE s.is_active AND c.is_active AND c.is_verified AND c.bot_can_post
    """


def _slot_datetime_utc(row: dict, now_local: datetime) -> datetime:
    """Дата-время сегодняшнего слота в UTC."""
    post_time = row["post_time"]
    slot_local = now_local.replace(
        hour=post_time.hour, minute=post_time.minute, second=0, microsecond=0
    )
    return slot_local.astimezone(timezone.utc)


def _row_tz(row: dict) -> ZoneInfo:
    try:
        return ZoneInfo(row["timezone"] or "Europe/Moscow")
    except Exception:
        return ZoneInfo("Europe/Moscow")


async def _fetch_schedules(pool) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(_schedule_rows_query())
    return [dict(row) for row in rows]


def _due_now(rows: list[dict]) -> list[dict]:
    due: list[dict] = []
    for row in rows:
        tz = _row_tz(row)
        now_local = datetime.now(tz)
        if now_local.weekday() not in (row["days_of_week"] or []):
            continue
        post_time = row["post_time"]
        if now_local.hour == post_time.hour and now_local.minute == post_time.minute:
            row = dict(row)
            row["scheduled_at"] = _slot_datetime_utc(row, now_local)
            due.append(row)
    return due


def _upcoming(rows: list[dict], lookahead_minutes: int) -> list[dict]:
    """Слоты, которые наступят в ближайшие lookahead_minutes."""
    upcoming: list[dict] = []
    for row in rows:
        tz = _row_tz(row)
        now_local = datetime.now(tz)
        if now_local.weekday() not in (row["days_of_week"] or []):
            continue
        slot_utc = _slot_datetime_utc(row, now_local)
        delta = slot_utc - datetime.now(timezone.utc)
        if timedelta(minutes=1) < delta <= timedelta(minutes=lookahead_minutes):
            row = dict(row)
            row["scheduled_at"] = slot_utc
            upcoming.append(row)
    return upcoming


async def _already_posted_this_minute(pool, channel_id: int) -> bool:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT 1 FROM posts
            WHERE channel_id = $1 AND status = 'published'
              AND published_at > now() - interval '90 seconds'
            LIMIT 1
            """,
            channel_id,
        )
    return row is not None


async def _publish_with_retries(publish_fn, item: dict) -> object | None:
    """Публикует слот с ретраями при временных сбоях.

    Ретраим только явные исключения (сеть, таймауты). Если publish_fn
    вернул результат с ok=False — это осмысленный отказ (например, все
    AI-провайдеры исчерпаны), его не ретраим на этом уровне: внутри
    publish_fn уже есть ротация провайдеров.
    """
    last_exc: Exception | None = None
    for attempt in range(1, PUBLISH_RETRIES + 1):
        try:
            return await publish_fn(item)
        except Exception as exc:  # сетевые сбои, таймауты Telegram
            last_exc = exc
            if attempt < PUBLISH_RETRIES:
                delay = RETRY_BASE_SECONDS * (2 ** (attempt - 1))  # 20с, 40с
                logger.warning(
                    "Publish attempt %s/%s failed for schedule %s, retrying in %ss: %s",
                    attempt, PUBLISH_RETRIES, item["schedule_id"], delay, exc,
                )
                await asyncio.sleep(delay)
    logger.error(
        "Publish failed after %s attempts for schedule %s: %s",
        PUBLISH_RETRIES, item["schedule_id"], last_exc,
    )
    return None


async def run_scheduler(pool, publish_fn, prepare_fn=None) -> None:
    """Бесконечный цикл планировщика.

    publish_fn(schedule_item) — корутина публикации слота (пост из очереди
        или свежая генерация). schedule_item содержит schedule_id, channel_id,
        chat_id, topic, mode, image_policy, scheduled_at.
    prepare_fn(schedule_item) — корутина предгенерации поста в очередь.
    """
    logger.info(
        "Scheduler started (interval %ss, pregen %s min)",
        CHECK_INTERVAL_SECONDS,
        PREGEN_MINUTES,
    )
    last_fired: dict[int, str] = {}
    last_prepared: dict[int, str] = {}
    loop_counter = 0

    while True:
        try:
            rows = await _fetch_schedules(pool)

            # 1. Предгенерация постов в очередь
            if prepare_fn is not None and PREGEN_MINUTES > 0:
                for item in _upcoming(rows, PREGEN_MINUTES):
                    slot_key = item["scheduled_at"].strftime("%Y-%m-%dT%H:%M")
                    if last_prepared.get(item["schedule_id"]) == slot_key:
                        continue
                    last_prepared[item["schedule_id"]] = slot_key
                    try:
                        await prepare_fn(item)
                    except Exception:
                        logger.exception(
                            "Pre-generation failed for schedule %s", item["schedule_id"]
                        )

            # 2. Публикация слотов, время которых наступило
            for item in _due_now(rows):
                slot_key = item["scheduled_at"].strftime("%Y-%m-%dT%H:%M")
                if last_fired.get(item["schedule_id"]) == slot_key:
                    continue
                last_fired[item["schedule_id"]] = slot_key

                if await _already_posted_this_minute(pool, item["channel_id"]):
                    continue

                # Атомарный claim в БД: переживает рестарты процесса
                # и защищает от двух параллельных экземпляров бота
                try:
                    claimed = await db.claim_slot(pool, item["schedule_id"], slot_key)
                except Exception:
                    logger.exception("Slot claim failed, skipping to be safe")
                    continue
                if not claimed:
                    logger.info(
                        "Slot %s for schedule %s already claimed, skipping",
                        slot_key, item["schedule_id"],
                    )
                    continue

                logger.info(
                    "Schedule %s fired: chat=%s topic=%s",
                    item["schedule_id"], item["chat_id"], item["topic"],
                )
                result = await _publish_with_retries(publish_fn, item)
                ok = bool(getattr(result, "ok", False)) if result is not None else False
                outcome = getattr(result, "outcome", "failed") if result is not None else "failed"
                message_id = getattr(result, "message_id", None) if result is not None else None
                # A claimed run is only successful after Telegram returned and
                # the exact target message was persisted. Cancellation is a
                # separate truthful terminal state.
                if outcome == "cancelled":
                    slot_status = "cancelled"
                elif ok and outcome == "published" and message_id is not None:
                    slot_status = "done"
                else:
                    slot_status = "failed"
                try:
                    await db.mark_slot_status(
                        pool, item["schedule_id"], slot_key, slot_status
                    )
                except Exception:
                    logger.warning("mark_slot_status failed", exc_info=True)
                logger.info("Scheduled publish result: %s", result)

            # чистим старые ключи, чтобы словари не росли бесконечно
            if len(last_fired) > 1000:
                last_fired.clear()
            if len(last_prepared) > 1000:
                last_prepared.clear()

            # раз в ~сутки чистим старые slot_runs
            loop_counter += 1
            if loop_counter % 2880 == 0:  # 2880 * 30с = 24ч
                try:
                    await db.cleanup_slot_runs(pool)
                except Exception:
                    logger.warning("slot_runs cleanup failed", exc_info=True)
        except Exception:
            logger.exception("Scheduler loop error")

        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
