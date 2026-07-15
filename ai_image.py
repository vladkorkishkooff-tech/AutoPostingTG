"""AI-генерация изображений для постов (best-effort).

Использует Gemini image model (нужен GEMINI_API_KEY / GEMINI_API_KEYS).
Если ключа нет или генерация не удалась — вызывающий код должен
откатиться на стоковые фото (image_fetcher) или пост без изображения.
"""

from __future__ import annotations

import base64
import logging
import os
import time

import aiohttp

from config import AppConfig, load_config

logger = logging.getLogger(__name__)

IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")
_KEY_COOLDOWNS: dict[str, float] = {}


async def _report_attempt(callback, *args) -> None:
    if not callback:
        return
    try:
        await callback(*args)
    except Exception:
        logger.exception("AI image attempt callback failed")


def _image_prompt(topic: str, post_text: str) -> str:
    return (
        "Create a high-quality, photorealistic horizontal illustration for a Russian "
        f"popular-science Telegram post about: {topic}. "
        f"The post text is: {post_text[:300]}. "
        "No text, no letters, no watermarks in the image. Clean composition, 16:9."
    )


def _gemini_keys(config: AppConfig, user_providers: list[dict] | None = None) -> list[tuple[str, str, int | None]]:
    """Return (key, provider label, key id) without exposing secrets to logs."""
    result: list[tuple[str, str, int | None]] = []
    seen: set[str] = set()
    for provider in user_providers or []:
        if str(provider.get("name") or "").lower() != "gemini":
            continue
        key = str(provider.get("api_key") or "").strip()
        if key and key not in seen:
            seen.add(key)
            result.append((key, "gemini:user", provider.get("key_id")))
    for key in config.gemini_api_keys or ([config.gemini_api_key] if config.gemini_api_key else []):
        if key and key not in seen:
            seen.add(key)
            result.append((key, "gemini:env", None))
    return result


def ai_image_available(
    config: AppConfig | None = None,
    user_providers: list[dict] | None = None,
) -> bool:
    config = config or load_config()
    return bool(_gemini_keys(config, user_providers))


def classify_ai_image_errors(errors: list[str]) -> str:
    """Convert provider attempt failures into a safe user-facing code."""
    normalized = [value for value in errors if value]
    if normalized and all(value == "http_429" for value in normalized):
        return "quota_exhausted"
    if any(value in {"http_401", "http_403"} for value in normalized):
        return "invalid_key"
    return "generation_failed"


async def generate_ai_image(
    topic: str,
    post_text: str,
    config: AppConfig | None = None,
    user_providers: list[dict] | None = None,
    on_attempt=None,
) -> tuple[bytes, str] | None:
    """Возвращает (bytes, filename) или None при неудаче."""
    config = config or load_config()
    keys = _gemini_keys(config, user_providers)
    if not keys:
        logger.info("AI image generation skipped: no Gemini API key")
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{IMAGE_MODEL}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": _image_prompt(topic, post_text)}]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    timeout = aiohttp.ClientTimeout(total=max(config.request_timeout_seconds, 60))

    for key, provider_label, key_id in keys:
        key_fingerprint = str(hash(key))
        if _KEY_COOLDOWNS.get(key_fingerprint, 0.0) > time.monotonic():
            continue
        started = time.monotonic()
        attempt_error: str | None = None
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    url,
                    params={"key": key},
                    json=payload,
                    proxy=config.outbound_proxy_url or None,
                ) as response:
                    if response.status >= 400:
                        await response.read()
                        attempt_error = f"http_{response.status}"
                        if response.status in {401, 403, 429} or response.status >= 500:
                            _KEY_COOLDOWNS[key_fingerprint] = time.monotonic() + (
                                300 if response.status in {401, 403, 429} else 60
                            )
                        logger.warning(
                            "AI image generation failed with HTTP %s (%s)",
                            response.status,
                            provider_label,
                        )
                        await _report_attempt(
                            on_attempt, provider_label, IMAGE_MODEL, False, attempt_error,
                            int((time.monotonic() - started) * 1000), key_id
                        )
                        continue
                    data = await response.json()
        except (aiohttp.ClientError, TimeoutError) as exc:
            logger.warning("AI image network error: %s", exc)
            await _report_attempt(
                on_attempt, provider_label, IMAGE_MODEL, False, "network_error",
                int((time.monotonic() - started) * 1000), key_id
            )
            continue
        except Exception:
            logger.exception("Unexpected AI image error")
            await _report_attempt(
                on_attempt, provider_label, IMAGE_MODEL, False, "unexpected_error",
                int((time.monotonic() - started) * 1000), key_id
            )
            continue

        candidates = data.get("candidates") or []
        for candidate in candidates:
            parts = (candidate.get("content") or {}).get("parts") or []
            for part in parts:
                inline = part.get("inlineData") or part.get("inline_data") or {}
                b64 = inline.get("data")
                if b64:
                    try:
                        raw = base64.b64decode(b64)
                    except Exception:
                        continue
                    if len(raw) > config.max_image_bytes:
                        logger.warning("AI image too large: %s bytes", len(raw))
                        continue
                    logger.info("AI image generated for topic %s (%s bytes)", topic, len(raw))
                    _KEY_COOLDOWNS.pop(key_fingerprint, None)
                    await _report_attempt(
                        on_attempt, provider_label, IMAGE_MODEL, True, None,
                        int((time.monotonic() - started) * 1000), key_id
                    )
                    return raw, "ai_generated.png"

        await _report_attempt(
            on_attempt, provider_label, IMAGE_MODEL, False, "empty_response",
            int((time.monotonic() - started) * 1000), key_id
        )

    logger.info("AI image generation returned nothing for topic %s", topic)
    return None
