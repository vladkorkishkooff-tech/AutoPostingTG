"""Планировщик: исполняет расписания из таблицы schedules.

Каждые 30 секунд:
1. Предгенерация: за PREGEN_MINUTES до слота генерирует пост и кладёт его
   в очередь (posts.status = 'queued'), чтобы владелец успел посмотреть
   и при необходимости отклонить/поправить его в Mini App.
2. Публикация: в момент слота публикует пост из очереди (queued/approved)
   или генерирует новый, если очередь пуста либо пост отклонён.

Тема слота: schedules.topic перекрывает channels.topic. Если у канала
есть активный пул тем (topic_pool), тема берётся из него по ротации.
Защита от двойного срабатывания — проверка последней публикации канала.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = 30
PREGEN_MINUTES = int(os.getenv("QUEUE_PREGEN_MINUTES", "60") or "60")


def _schedule_rows_query() -> str:
    return """
        SELECT s.id AS schedule_id, s.post_time, s.days_of_week, s.timezone,
               COALESCE(s.topic, c.topic) AS topic,
               COALESCE(s.mode, c.mode) AS mode,
               c.id AS channel_id, c.chat_id, c.image_policy
        FROM schedules s
        JOIN channels c ON c.id = s.channel_id
        WHERE s.is_active AND c.is_active
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
                minute_key = datetime.utcnow().strftime("%Y-%m-%dT%H:%M")
                if last_fired.get(item["schedule_id"]) == minute_key:
                    continue
                if await _already_posted_this_minute(pool, item["channel_id"]):
                    last_fired[item["schedule_id"]] = minute_key
                    continue

                last_fired[item["schedule_id"]] = minute_key
                logger.info(
                    "Schedule %s fired: chat=%s topic=%s",
                    item["schedule_id"], item["chat_id"], item["topic"],
                )
                try:
                    result = await publish_fn(item)
                    logger.info("Scheduled publish result: %s", result)
                except Exception:
                    logger.exception(
                        "Scheduled publish failed for schedule %s", item["schedule_id"]
                    )

            # чистим старые ключи, чтобы словари не росли бесконечно
            if len(last_fired) > 1000:
                last_fired.clear()
            if len(last_prepared) > 1000:
                last_prepared.clear()
        except Exception:
            logger.exception("Scheduler loop error")

        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
