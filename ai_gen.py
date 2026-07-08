import logging
from dataclasses import dataclass

import aiohttp

from config import AppConfig, load_config

logger = logging.getLogger(__name__)


MODE_ALIASES = {
    "normal": "normal",
    "обычный": "normal",
    "обычно": "normal",
    "funny": "funny",
    "fun": "funny",
    "смешной": "funny",
    "смешно": "funny",
    "wow": "wow",
    "interesting": "wow",
    "интересный": "wow",
    "интересно": "wow",
    "strict": "strict",
    "dry": "strict",
    "строгий": "strict",
    "строго": "strict",
}


MODE_DESCRIPTIONS = {
    "normal": "короткий нейтральный научный факт без воды",
    "funny": "короткий факт с лёгкой иронией, но без кринжа и без мема вместо факта",
    "wow": "факт с эффектом удивления: неожиданное свойство, число или контраст",
    "strict": "сухой информативный факт, максимально нейтральный стиль",
}


@dataclass(frozen=True)
class LLMProvider:
    name: str
    base_url: str
    api_key: str
    models: list[str]

    @property
    def is_enabled(self) -> bool:
        return bool(self.api_key and self.models and self.base_url)


def _gemini_providers(config: AppConfig) -> list[LLMProvider]:
    """One provider per Gemini key — rotation doubles free-tier limits."""
    keys = config.gemini_api_keys or ([config.gemini_api_key] if config.gemini_api_key else [])
    return [
        LLMProvider(
            name=f"gemini{'' if i == 0 else f'-{i + 1}'}",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai",
            api_key=key,
            models=config.gemini_models,
        )
        for i, key in enumerate(keys)
    ]


def _provider_map(config: AppConfig) -> dict[str, LLMProvider]:
    gemini_list = _gemini_providers(config)
    return {
        "groq": LLMProvider(
            name="groq",
            base_url="https://api.groq.com/openai/v1",
            api_key=config.groq_api_key,
            models=config.groq_models,
        ),
        "mistral": LLMProvider(
            name="mistral",
            base_url="https://api.mistral.ai/v1",
            api_key=config.mistral_api_key,
            models=config.mistral_models,
        ),
        "gemini": gemini_list[0]
        if gemini_list
        else LLMProvider(name="gemini", base_url="", api_key="", models=[]),
        "nvidia": LLMProvider(
            name="nvidia",
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=config.nvidia_api_key,
            models=config.nvidia_models,
        ),
        "openrouter": LLMProvider(
            name="openrouter",
            base_url="https://openrouter.ai/api/v1",
            api_key=config.openrouter_api_key,
            models=config.openrouter_models,
        ),
        "custom": LLMProvider(
            name="custom",
            base_url=config.custom_openai_base_url.rstrip("/"),
            api_key=config.custom_openai_api_key,
            models=config.custom_openai_models,
        ),
    }


def enabled_provider_names(config: AppConfig | None = None) -> list[str]:
    config = config or load_config()
    providers = _provider_map(config)
    return [
        name
        for name in config.llm_provider_order
        if providers.get(name) and providers[name].is_enabled
    ]


def _trim_for_telegram(text: str, limit: int = 430) -> str:
    text = " ".join(text.replace("\r", "\n").split())
    for prefix in ("Конечно, ", "Конечно. ", "Вот факт: ", "Факт: "):
        if text.startswith(prefix):
            text = text[len(prefix) :].strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "..."


def normalize_mode(mode: str | None, config: AppConfig | None = None) -> str:
    default = (config.default_mode if config else "normal") or "normal"
    raw = (mode or default).strip().lower()
    return MODE_ALIASES.get(raw, MODE_ALIASES.get(default, "normal"))


def available_modes() -> list[str]:
    return list(MODE_DESCRIPTIONS.keys())


def is_mode_token(value: str | None) -> bool:
    return bool(value and value.strip().lower() in MODE_ALIASES)


def _system_prompt(mode: str, config: AppConfig, avoid_texts: list[str] | None = None) -> str:
    mode_description = MODE_DESCRIPTIONS.get(mode, MODE_DESCRIPTIONS["normal"])
    avoid_block = ""
    if avoid_texts:
        recent = "\n".join(f"- {text}" for text in avoid_texts[:8])
        avoid_block = f" Не повторяй эти недавние посты по смыслу и формулировке:\n{recent}"
    return (
        "Ты пишешь посты для Telegram-канала о науке на русском языке. "
        "Нужен формат как в научно-популярном Telegram-посте: один короткий факт, 90-260 знаков. "
        "Без воды, без объяснения задачи, без markdown, без ссылок, без вопроса в конце, без призыва к обсуждению. "
        "Факт должен быть конкретным: объект, свойство, причина или числовая деталь. "
        "Первым символом поставь уместный эмодзи. "
        f"Режим: {mode_description}. "
        f"Эталон стиля: {config.post_style_example}"
        f"{avoid_block}"
    )


def _user_prompt(topic: str, mode: str) -> str:
    return (
        f"Тема: {topic}. Режим: {mode}. "
        "Верни только готовый текст факта одним абзацем. "
        "Не копируй эталон буквально, используй только его длину, плотность и подачу."
    )


async def _call_openai_compatible(
    provider: LLMProvider,
    model: str,
    topic: str,
    mode: str,
    config: AppConfig,
    avoid_texts: list[str] | None = None,
) -> str | None:
    url = f"{provider.base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {provider.api_key}",
        "Content-Type": "application/json",
        "User-Agent": "ai-content-manager/1.0",
    }
    if provider.name == "openrouter":
        headers["HTTP-Referer"] = "https://github.com/"
        headers["X-Title"] = "AI Content Manager"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _system_prompt(mode, config, avoid_texts)},
            {"role": "user", "content": _user_prompt(topic, mode)},
        ],
        "temperature": 0.35,
        "max_tokens": 180,
    }

    timeout = aiohttp.ClientTimeout(total=config.request_timeout_seconds)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                url,
                headers=headers,
                json=payload,
                proxy=config.outbound_proxy_url or None,
            ) as response:
                if response.status >= 400:
                    body = await response.text()
                    logger.warning(
                        "LLM provider %s model %s failed with HTTP %s: %s",
                        provider.name,
                        model,
                        response.status,
                        body[:300],
                    )
                    return None

                data = await response.json()
                choices = data.get("choices") or []
                if not choices:
                    logger.warning("LLM provider %s returned empty choices", provider.name)
                    return None

                message = choices[0].get("message") or {}
                content = (message.get("content") or "").strip()
                if not content:
                    logger.warning("LLM provider %s returned empty content", provider.name)
                    return None

                logger.info("Generated post via %s model %s", provider.name, model)
                return _trim_for_telegram(content)
    except (aiohttp.ClientError, TimeoutError) as exc:
        logger.warning("LLM provider %s model %s network error: %s", provider.name, model, exc)
        return None
    except Exception:
        logger.exception("Unexpected LLM provider %s model %s error", provider.name, model)
        return None


async def generate_post(
    topic: str,
    config: AppConfig | None = None,
    mode: str | None = None,
    avoid_texts: list[str] | None = None,
    user_providers: list[dict] | None = None,
    on_attempt=None,
) -> str | None:
    """Generate a post via the provider chain.

    Order: client keys from the Mini App vault (user_providers) first,
    then env-configured providers (with Gemini key rotation).
    on_attempt: optional async callback (provider_name, model, success, error, duration_ms).

    Returns None when every provider fails: callers must handle this
    explicitly instead of silently publishing canned template content.
    """
    import time as _time

    config = config or load_config()
    normalized_mode = normalize_mode(mode, config)

    async def _try(provider: LLMProvider, model: str) -> str | None:
        start = _time.monotonic()
        result = await _call_openai_compatible(provider, model, topic, normalized_mode, config, avoid_texts)
        if on_attempt:
            try:
                await on_attempt(
                    provider.name,
                    model,
                    result is not None,
                    None if result else "generation failed",
                    int((_time.monotonic() - start) * 1000),
                )
            except Exception:
                logger.exception("on_attempt callback failed")
        return result

    # 1. Ключи клиента из сейфа Mini App — приоритетнее общих
    for up in user_providers or []:
        provider = LLMProvider(
            name=up["name"],
            base_url=up["base_url"],
            api_key=up["api_key"],
            models=up["models"],
        )
        if not provider.is_enabled:
            continue
        for model in provider.models:
            result = await _try(provider, model)
            if result:
                return result

    # 2. Общие провайдеры из env
    providers = _provider_map(config)
    gemini_rotation = _gemini_providers(config)

    for provider_name in config.llm_provider_order:
        if provider_name == "gemini" and gemini_rotation:
            for gp in gemini_rotation:
                for model in gp.models:
                    result = await _try(gp, model)
                    if result:
                        return result
            continue

        provider = providers.get(provider_name)
        if not provider or not provider.is_enabled:
            continue

        for model in provider.models:
            result = await _try(provider, model)
            if result:
                return result

    logger.error("All LLM providers failed for topic %s", topic)
    return None
