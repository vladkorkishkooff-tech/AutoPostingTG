import os
from dataclasses import dataclass
from typing import Iterable

from dotenv import load_dotenv


def _getenv(name: str, default: str = "") -> str:
    value = os.getenv(name, default)
    if value == default:
        for key, candidate in os.environ.items():
            if key.strip() == name:
                value = candidate
                break
    return value.strip() if isinstance(value, str) else default


def _get_int(name: str, default: int) -> int:
    value = _getenv(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _get_float(name: str, default: float) -> float:
    value = _getenv(name)
    if not value:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _get_list(name: str, default: Iterable[str]) -> list[str]:
    raw = _getenv(name)
    if not raw:
        return list(default)
    return [item.strip().lower() for item in raw.split(",") if item.strip()]


def _get_ids(name: str) -> set[int]:
    ids: set[int] = set()
    for item in _get_list(name, []):
        try:
            ids.add(int(item))
        except ValueError:
            continue
    return ids


@dataclass(frozen=True)
class AppConfig:
    bot_token: str
    channel_id: str
    channel_url: str
    telegram_proxy_url: str
    outbound_proxy_url: str
    default_topic: str
    default_mode: str
    post_style_example: str
    post_interval_hours: int
    post_on_startup: bool
    disable_periodic_posting: bool
    admin_user_ids: set[int]
    llm_provider_order: list[str]
    request_timeout_seconds: int
    max_image_bytes: int
    history_file: str
    history_limit: int
    recent_post_limit: int
    recent_image_limit: int
    generation_attempts: int

    groq_api_key: str
    groq_models: list[str]
    mistral_api_key: str
    mistral_models: list[str]
    gemini_api_key: str
    gemini_models: list[str]
    nvidia_api_key: str
    nvidia_models: list[str]
    openrouter_api_key: str
    openrouter_models: list[str]
    custom_openai_api_key: str
    custom_openai_base_url: str
    custom_openai_models: list[str]

    nasa_api_key: str
    pixabay_api_key: str
    pexels_api_key: str
    unsplash_access_key: str

    @property
    def has_required_telegram_config(self) -> bool:
        return bool(self.bot_token and self.channel_id)


def load_config() -> AppConfig:
    load_dotenv()

    return AppConfig(
        bot_token=_getenv("BOT_TOKEN"),
        channel_id=_getenv("CHANNEL_ID") or _getenv("TARGET_CHANNEL"),
        channel_url=_getenv("CHANNEL_URL"),
        telegram_proxy_url=_getenv("TELEGRAM_PROXY_URL"),
        outbound_proxy_url=_getenv("OUTBOUND_PROXY_URL") or _getenv("TELEGRAM_PROXY_URL"),
        default_topic=_getenv("DEFAULT_TOPIC", "наука"),
        default_mode=_getenv("DEFAULT_MODE", "normal").lower(),
        post_style_example=_getenv(
            "POST_STYLE_EXAMPLE",
            "🤬 В японском языке нет ругательств сильнее, чем «дурак» и «идиот»",
        ),
        post_interval_hours=_get_int("POST_INTERVAL_HOURS", 24),
        post_on_startup=_getenv("POST_ON_STARTUP", "false").lower() in {"1", "true", "yes", "on"},
        disable_periodic_posting=_getenv("DISABLE_PERIODIC_POSTING", "false").lower()
        in {"1", "true", "yes", "on"},
        admin_user_ids=_get_ids("ADMIN_USER_IDS"),
        llm_provider_order=_get_list(
            "LLM_PROVIDER_ORDER",
            ["groq", "mistral", "gemini", "nvidia", "openrouter", "custom"],
        ),
        request_timeout_seconds=_get_int("REQUEST_TIMEOUT_SECONDS", 30),
        max_image_bytes=_get_int("MAX_IMAGE_BYTES", 8_000_000),
        history_file=_getenv("HISTORY_FILE", "data/content_history.json"),
        history_limit=_get_int("HISTORY_LIMIT", 500),
        recent_post_limit=_get_int("RECENT_POST_LIMIT", 40),
        recent_image_limit=_get_int("RECENT_IMAGE_LIMIT", 60),
        generation_attempts=_get_int("GENERATION_ATTEMPTS", 4),
        groq_api_key=_getenv("GROQ_API_KEY"),
        groq_models=_get_list(
            "GROQ_MODELS",
            [
                _getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
                "llama-3.3-70b-versatile",
                "gemma2-9b-it",
                "qwen/qwen3-32b",
            ],
        ),
        mistral_api_key=_getenv("MISTRAL_API_KEY"),
        mistral_models=_get_list("MISTRAL_MODELS", [_getenv("MISTRAL_MODEL", "mistral-small-latest")]),
        gemini_api_key=_getenv("GEMINI_API_KEY"),
        gemini_models=_get_list("GEMINI_MODELS", [_getenv("GEMINI_MODEL", "gemini-2.0-flash")]),
        nvidia_api_key=_getenv("NVIDIA_API_KEY"),
        nvidia_models=_get_list(
            "NVIDIA_MODELS",
            [
                _getenv("NVIDIA_MODEL", "meta/llama-3.1-8b-instruct"),
                "mistralai/mistral-7b-instruct-v0.3",
                "google/gemma-2-9b-it",
            ],
        ),
        openrouter_api_key=_getenv("OPENROUTER_API_KEY") or _getenv("OPENROUTER_KEY"),
        openrouter_models=_get_list(
            "OPENROUTER_MODELS",
            [
                _getenv("OPENROUTER_MODEL", "z-ai/glm-4.5-air:free"),
                "qwen/qwen3-14b:free",
                "meta-llama/llama-3.2-3b-instruct:free",
            ],
        ),
        custom_openai_api_key=_getenv("CUSTOM_OPENAI_API_KEY"),
        custom_openai_base_url=_getenv("CUSTOM_OPENAI_BASE_URL"),
        custom_openai_models=_get_list("CUSTOM_OPENAI_MODELS", [_getenv("CUSTOM_OPENAI_MODEL")]),
        nasa_api_key=_getenv("NASA_API_KEY") or "DEMO_KEY",
        pixabay_api_key=_getenv("PIXABAY_API_KEY"),
        pexels_api_key=_getenv("PEXELS_API_KEY"),
        unsplash_access_key=_getenv("UNSPLASH_ACCESS_KEY"),
    )
