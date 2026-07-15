"""Client API keys: decrypt keys stored by the Mini App and build providers.

Encryption format matches lib/crypto.ts (AES-256-GCM):
    base64(iv12) . base64(tag16) . base64(ciphertext)
Key = sha256(KEYS_ENCRYPTION_SECRET).
"""

import base64
import asyncio
import hashlib
import ipaddress
import logging
import os
import socket
import time
from urllib.parse import urlparse

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


async def is_public_https_url(value: str) -> bool:
    """Re-check a custom endpoint at runtime, including its current DNS answers."""
    try:
        parsed = urlparse(value)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            return False
        addresses = await asyncio.get_running_loop().getaddrinfo(
            parsed.hostname,
            parsed.port or 443,
            type=socket.SOCK_STREAM,
        )
    except (OSError, UnicodeError, ValueError):
        return False
    if not addresses:
        return False
    try:
        return all(ipaddress.ip_address(item[4][0]).is_global for item in addresses)
    except ValueError:
        return False


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
        SELECT k.id, k.provider, k.model, k.base_url, k.encrypted_key
        FROM api_keys k
        LEFT JOIN provider_settings s
          ON s.user_id = k.user_id AND s.provider = k.provider
        WHERE k.user_id = $1 AND k.is_active = true
          AND COALESCE(s.is_enabled, true) = true
        ORDER BY COALESCE(s.priority, k.priority) ASC, k.priority ASC, k.id ASC
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
        if provider == "custom" and not await is_public_https_url(base_url):
            logger.warning("Skipping custom key id=%s: endpoint is not public HTTPS", row["id"])
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


def key_attempt_logger(pool: asyncpg.Pool):
    """Build an AI-image attempt hook that updates the encrypted key record.

    The callback deliberately stores only a short error code, never a response
    body or decrypted secret.
    """

    async def callback(
        provider: str,
        model: str,
        success: bool,
        error: str | None,
        duration_ms: int,
        key_id: int | None,
    ) -> None:
        del provider, model, duration_ms
        if key_id is not None:
            await mark_key_used(pool, key_id, None if success else (error or "request_failed")[:120])

    return callback


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
