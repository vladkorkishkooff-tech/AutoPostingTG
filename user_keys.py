"""Client API keys: decrypt keys stored by the Mini App and build providers.

Encryption format matches lib/crypto.ts (AES-256-GCM):
    base64(iv12) . base64(tag16) . base64(ciphertext)
Key = sha256(KEYS_ENCRYPTION_SECRET).
"""

import base64
import hashlib
import logging
import os
import time

import asyncpg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

# Дефолтные base_url для известных провайдеров (совпадает с lib/providers-catalog.ts)
PROVIDER_BASE_URLS = {
    "anthropic": "https://api.anthropic.com/v1",
    "openai": "https://api.openai.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "deepseek": "https://api.deepseek.com/v1",
    "minimax": "https://api.minimax.io/v1",
    "glm": "https://open.bigmodel.cn/api/paas/v4",
    "groq": "https://api.groq.com/openai/v1",
    "mistral": "https://api.mistral.ai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "v0": "https://api.v0.dev/v1",
}

PROVIDER_DEFAULT_MODELS = {
    "anthropic": "claude-haiku-4-5",
    "openai": "gpt-4.1-mini",
    "gemini": "gemini-2.5-flash",
    "deepseek": "deepseek-chat",
    "minimax": "MiniMax-M2",
    "glm": "glm-4.5-air",
    "groq": "llama-3.3-70b-versatile",
    "mistral": "mistral-small-latest",
    "openrouter": "deepseek/deepseek-chat-v3-0324:free",
    "v0": "v0-1.5-md",
}


def _encryption_key() -> bytes:
    secret = os.getenv("KEYS_ENCRYPTION_SECRET", "").strip()
    if not secret:
        raise RuntimeError("KEYS_ENCRYPTION_SECRET is not set")
    return hashlib.sha256(secret.encode("utf-8")).digest()


def decrypt_secret(payload: str) -> str:
    iv_b64, tag_b64, data_b64 = payload.split(".")
    iv = base64.b64decode(iv_b64)
    tag = base64.b64decode(tag_b64)
    data = base64.b64decode(data_b64)
    aesgcm = AESGCM(_encryption_key())
    plain = aesgcm.decrypt(iv, data + tag, None)
    return plain.decode("utf-8")


async def fetch_user_providers(pool: asyncpg.Pool, user_id: int) -> list[dict]:
    """Returns ordered provider dicts: name, base_url, api_key, models, key_id."""
    rows = await pool.fetch(
        """
        SELECT id, provider, model, base_url, encrypted_key
        FROM api_keys
        WHERE user_id = $1 AND is_active = true
        ORDER BY priority ASC, id ASC
        """,
        user_id,
    )
    providers: list[dict] = []
    for row in rows:
        try:
            api_key = decrypt_secret(row["encrypted_key"])
        except Exception:
            logger.exception("Failed to decrypt api_key id=%s", row["id"])
            continue
        provider = row["provider"]
        base_url = (row["base_url"] or PROVIDER_BASE_URLS.get(provider, "")).rstrip("/")
        model = row["model"] or PROVIDER_DEFAULT_MODELS.get(provider, "")
        if not base_url or not model:
            logger.warning("Skipping key id=%s: missing base_url or model", row["id"])
            continue
        providers.append(
            {
                "key_id": row["id"],
                "name": provider,
                "base_url": base_url,
                "api_key": api_key,
                "models": [model],
            }
        )
    return providers


async def mark_key_used(pool: asyncpg.Pool, key_id: int, error: str | None = None) -> None:
    await pool.execute(
        "UPDATE api_keys SET last_used_at = now(), last_error = $2 WHERE id = $1",
        key_id,
        error,
    )


async def log_usage(
    pool: asyncpg.Pool,
    *,
    user_id: int | None,
    channel_id: int | None,
    event_type: str,
    provider: str | None = None,
    model: str | None = None,
    success: bool = True,
    error: str | None = None,
    duration_ms: int | None = None,
) -> None:
    try:
        await pool.execute(
            """
            INSERT INTO usage_events (user_id, channel_id, event_type, provider, model, success, error, duration_ms)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
            user_id,
            channel_id,
            event_type,
            provider,
            model,
            success,
            error,
            duration_ms,
        )
    except Exception:
        logger.exception("Failed to log usage event")


class Timer:
    def __enter__(self):
        self._start = time.monotonic()
        return self

    def __exit__(self, *args):
        self.ms = int((time.monotonic() - self._start) * 1000)
