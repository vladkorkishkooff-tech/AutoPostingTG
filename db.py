"""Postgres (Neon) storage layer for the bot.

Replaces the JSON content history with a proper multi-tenant database.
Falls back gracefully: if DATABASE_URL is not set, main.py keeps using
the legacy JSON ContentHistory.
"""

import logging
from datetime import datetime, timezone

import asyncpg

from content_history import text_hash

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


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
        "SELECT id, chat_id, topic, mode, image_policy, is_active FROM channels WHERE id = $1",
        channel_id,
    )
    return dict(row) if row else None


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
    """Пост из очереди для конкретного слота (queued или approved).

    Rejected-посты игнорируются — вместо них генерируется новый.
    """
    row = await pool.fetchrow(
        """
        SELECT id, channel_id, topic, mode, text, image_url, image_source, media_type, status
        FROM posts
        WHERE schedule_id = $1
          AND status IN ('queued', 'approved')
          AND scheduled_at BETWEEN $2::timestamptz - interval '12 hours' AND $2::timestamptz + interval '5 minutes'
        ORDER BY status = 'approved' DESC, created_at DESC
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
    telegram_message_id: int | None,
) -> None:
    await pool.execute(
        """
        UPDATE posts
        SET status = 'published', published_at = now(), telegram_message_id = $2, error = NULL
        WHERE id = $1
        """,
        post_id,
        telegram_message_id,
    )


async def mark_post_failed(pool: asyncpg.Pool, post_id: int, error: str) -> None:
    await pool.execute(
        "UPDATE posts SET status = 'failed', error = $2 WHERE id = $1",
        post_id,
        error[:500],
    )


async def active_channels(pool: asyncpg.Pool) -> list[dict]:
    rows = await pool.fetch(
        "SELECT id, chat_id FROM channels WHERE is_active ORDER BY id"
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
