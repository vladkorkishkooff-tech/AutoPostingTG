"""AI-генерация изображений для постов (best-effort).

Использует Gemini image model (нужен GEMINI_API_KEY / GEMINI_API_KEYS).
Если ключа нет или генерация не удалась — вызывающий код должен
откатиться на стоковые фото (image_fetcher) или пост без изображения.
"""

from __future__ import annotations

import base64
import logging
import os

import aiohttp

from config import AppConfig, load_config

logger = logging.getLogger(__name__)

IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")


def _image_prompt(topic: str, post_text: str) -> str:
    return (
        "Create a high-quality, photorealistic horizontal illustration for a Russian "
        f"popular-science Telegram post about: {topic}. "
        f"The post text is: {post_text[:300]}. "
        "No text, no letters, no watermarks in the image. Clean composition, 16:9."
    )


def ai_image_available(config: AppConfig | None = None) -> bool:
    config = config or load_config()
    return bool(config.gemini_api_keys or config.gemini_api_key)


async def generate_ai_image(
    topic: str,
    post_text: str,
    config: AppConfig | None = None,
) -> tuple[bytes, str] | None:
    """Возвращает (bytes, filename) или None при неудаче."""
    config = config or load_config()
    keys = config.gemini_api_keys or ([config.gemini_api_key] if config.gemini_api_key else [])
    if not keys:
        logger.info("AI image generation skipped: no Gemini API key")
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{IMAGE_MODEL}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": _image_prompt(topic, post_text)}]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    timeout = aiohttp.ClientTimeout(total=max(config.request_timeout_seconds, 60))

    for key in keys:
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    url,
                    params={"key": key},
                    json=payload,
                    proxy=config.outbound_proxy_url or None,
                ) as response:
                    if response.status >= 400:
                        body = await response.text()
                        logger.warning(
                            "AI image generation failed with HTTP %s: %s",
                            response.status,
                            body[:300],
                        )
                        continue
                    data = await response.json()
        except (aiohttp.ClientError, TimeoutError) as exc:
            logger.warning("AI image network error: %s", exc)
            continue
        except Exception:
            logger.exception("Unexpected AI image error")
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
                    return raw, "ai_generated.png"

    logger.info("AI image generation returned nothing for topic %s", topic)
    return None
