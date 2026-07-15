"""Apply tracked PostgreSQL migrations for the bot and Mini App."""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)
MIGRATIONS_DIR = Path(__file__).with_name("migrations")
LOCK_ID = 8_040_413_112

load_dotenv()


async def apply_migrations(database_url: str) -> list[str]:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        raise RuntimeError(f"No migration files found in {MIGRATIONS_DIR}")

    connection = await asyncpg.connect(database_url)
    applied: list[str] = []
    try:
        await connection.execute("SELECT pg_advisory_lock($1)", LOCK_ID)
        await connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        for file in files:
            already_applied = await connection.fetchval(
                "SELECT 1 FROM schema_migrations WHERE version = $1", file.name
            )
            if already_applied:
                continue
            sql = file.read_text(encoding="utf-8")
            async with connection.transaction():
                await connection.execute(sql)
                await connection.execute(
                    "INSERT INTO schema_migrations(version) VALUES ($1)", file.name
                )
            applied.append(file.name)
            logger.info("Applied migration %s", file.name)
    finally:
        try:
            await connection.execute("SELECT pg_advisory_unlock($1)", LOCK_ID)
        finally:
            await connection.close()
    return applied


async def main() -> None:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required to apply migrations")
    applied = await apply_migrations(database_url)
    logger.info("Migrations complete (%s applied)", len(applied))


if __name__ == "__main__":
    asyncio.run(main())
