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
) -> int:
    row = await pool.fetchrow(
        """
        INSERT INTO posts (channel_id, topic, mode, text, text_hash, image_url, image_source,
                           status, published_at, telegram_message_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', $8, $9)
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
    )
    return row["id"]
