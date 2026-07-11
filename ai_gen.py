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
        # v0 Model API (OpenAI-совместимый). Модели заточены под код,
        # но подходят для теста цепочки «ключ → генерация → публикация».
        "v0": LLMProvider(
            name="v0",
            base_url="https://api.v0.dev/v1",
            api_key=config.v0_api_key,
            models=config.v0_models,
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


_IMAGE_QUERY_CACHE: dict[str, list[str]] = {}


async def topic_to_image_queries(
    topic: str,
    config: AppConfig | None = None,
    user_providers: list[dict] | None = None,
) -> list[str]:
    """Переводит тему поста в 3 английских поисковых запроса для фотостоков.

    Главный фикс качества фото: Unsplash/Pexels/Pixabay плохо ищут по-русски.
    Результат кешируется в памяти по теме. При отказе всех провайдеров
    возвращается [] — вызывающий код ищет по теме как раньше.
    """
    key = topic.strip().lower()
    if key in _IMAGE_QUERY_CACHE:
        return _IMAGE_QUERY_CACHE[key]

    config = config or load_config()
    messages = [
        {
            "role": "system",
            "content": (
                "You convert a social media post topic (any language) into English stock photo "
                "search queries. Return EXACTLY 3 short queries (2-4 words each), one per line, "
                "no numbering, no punctuation, no explanations. Queries must describe concrete "
                "visual scenes/objects a photographer could shoot, not abstract concepts."
            ),
        },
        {"role": "user", "content": f"Topic: {topic}"},
    ]

    candidates: list[LLMProvider] = []
    for up in user_providers or []:
        p = LLMProvider(name=up["name"], base_url=up["base_url"], api_key=up["api_key"], models=up["models"])
        if p.is_enabled:
            candidates.append(p)
    provider_map = _provider_map(config)
    for name in config.llm_provider_order:
        p = provider_map.get(name)
        if p and p.is_enabled:
            candidates.append(p)

    timeout = aiohttp.ClientTimeout(total=min(config.request_timeout_seconds, 15))
    for provider in candidates[:3]:  # максимум 3 попытки — это вспомогательный вызов
        model = provider.models[0]
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    f"{provider.base_url.rstrip('/')}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {provider.api_key}",
                        "Content-Type": "application/json",
                        "User-Agent": "ai-content-manager/1.0",
                    },
                    json={"model": model, "messages": messages, "temperature": 0.2, "max_tokens": 60},
                    proxy=config.outbound_proxy_url or None,
                ) as response:
                    if response.status >= 400:
                        continue
                    data = await response.json()
                    content = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
                    queries = [
                        line.strip().strip("-•.,\"'")
                        for line in content.splitlines()
                        if line.strip() and len(line.strip()) < 60
                    ][:3]
                    if queries:
                        logger.info("Image queries for topic %r via %s: %s", topic, provider.name, queries)
                        _IMAGE_QUERY_CACHE[key] = queries
                        if len(_IMAGE_QUERY_CACHE) > 500:
                            _IMAGE_QUERY_CACHE.clear()
                        return queries
        except (aiohttp.ClientError, TimeoutError) as exc:
            logger.warning("Image query translation via %s failed: %s", provider.name, exc)
        except Exception:
            logger.exception("Unexpected image query translation error via %s", provider.name)

    return []


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
