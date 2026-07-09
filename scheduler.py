"""Планировщик: исполняет расписания из таблицы schedules.

Каждую минуту проверяет активные расписания (post_time, days_of_week,
timezone per-канал) и вызывает publish_post для каналов, у которых
наступило время публикации. Защита от двойного срабатывания — проверка
последней публикации канала за ту же минуту.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = 30


async def _due_schedules(pool) -> list[dict]:
    """Возвращает расписания, которые должны сработать прямо сейчас."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.id AS schedule_id, s.post_time, s.days_of_week, s.timezone,
                   c.id AS channel_id, c.chat_id, c.topic, c.mode
            FROM schedules s
            JOIN channels c ON c.id = s.channel_id
            WHERE s.is_active AND c.is_active
            """
        )

    due: list[dict] = []
    for row in rows:
        try:
            tz = ZoneInfo(row["timezone"] or "Europe/Moscow")
        except Exception:
            tz = ZoneInfo("Europe/Moscow")
        now_local = datetime.now(tz)
        # days_of_week: 0 = понедельник ... 6 = воскресенье
        if now_local.weekday() not in (row["days_of_week"] or []):
            continue
        post_time = row["post_time"]
        if now_local.hour == post_time.hour and now_local.minute == post_time.minute:
            due.append(dict(row))
    return due


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


async def run_scheduler(pool, publish_fn) -> None:
    """Бесконечный цикл планировщика.

    publish_fn(topic, mode, target_chat) — корутина публикации (publish_post).
    """
    logger.info("Scheduler started (interval %ss)", CHECK_INTERVAL_SECONDS)
    last_fired: dict[int, str] = {}

    while True:
        try:
            due = await _due_schedules(pool)
            for item in due:
                minute_key = datetime.utcnow().strftime("%Y-%m-%dT%H:%M")
                fired_key = last_fired.get(item["schedule_id"])
                if fired_key == minute_key:
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
                    result = await publish_fn(
                        topic=item["topic"],
                        mode=item["mode"],
                        target_chat=item["chat_id"],
                    )
                    logger.info("Scheduled publish result: %s", result)
                except Exception:
                    logger.exception("Scheduled publish failed for schedule %s", item["schedule_id"])

            # чистим старые ключи, чтобы словарь не рос бесконечно
            if len(last_fired) > 1000:
                last_fired.clear()
        except Exception:
            logger.exception("Scheduler loop error")

        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
