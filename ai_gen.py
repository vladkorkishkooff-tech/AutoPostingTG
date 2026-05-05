import logging
import random
from dataclasses import dataclass

import aiohttp

from config import AppConfig, load_config

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LLMProvider:
    name: str
    base_url: str
    api_key: str
    models: list[str]

    @property
    def is_enabled(self) -> bool:
        return bool(self.api_key and self.models and self.base_url)


def _provider_map(config: AppConfig) -> dict[str, LLMProvider]:
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
        "gemini": LLMProvider(
            name="gemini",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai",
            api_key=config.gemini_api_key,
            models=config.gemini_models,
        ),
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
    names = [name for name in config.llm_provider_order if name == "local" or providers.get(name, None)]
    return [name for name in names if name == "local" or providers[name].is_enabled]


def _trim_for_telegram(text: str, limit: int = 430) -> str:
    text = " ".join(text.replace("\r", "\n").split())
    for prefix in ("Конечно, ", "Конечно. ", "Вот факт: ", "Факт: "):
        if text.startswith(prefix):
            text = text[len(prefix) :].strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "..."


def _system_prompt() -> str:
    return (
        "Ты пишешь посты для Telegram-канала о науке на русском языке. "
        "Нужен формат как в научно-популярном Telegram-посте: один короткий факт, 90-260 знаков. "
        "Без воды, без объяснения задачи, без markdown, без ссылок, без вопроса в конце, без призыва к обсуждению. "
        "Факт должен быть конкретным: объект, свойство, причина или числовая деталь. "
        "Первым символом поставь уместный эмодзи."
    )


def _user_prompt(topic: str) -> str:
    return (
        f"Тема: {topic}. "
        "Верни только готовый текст факта одним абзацем. "
        "Пример стиля: 🤬 В японском языке нет ругательств сильнее, чем «дурак» и «идиот». "
        "Не копируй пример, придумай другой корректный факт по теме."
    )


async def _call_openai_compatible(
    provider: LLMProvider,
    model: str,
    topic: str,
    config: AppConfig,
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
            {"role": "system", "content": _system_prompt()},
            {"role": "user", "content": _user_prompt(topic)},
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


def _local_post(topic: str) -> str:
    facts = {
        "наука": [
            "🔬 Научная гипотеза ценна не убедительностью, а проверяемостью: хороший эксперимент должен иметь шанс её опровергнуть",
            "🧪 Многие открытия начинались с «ошибки» в измерениях. Если эффект повторялся, учёным приходилось менять объяснение, а не данные",
        ],
        "космос": [
            "☀️ Свет от Солнца идёт до Земли примерно 8 минут 20 секунд, поэтому мы всегда видим Солнце таким, каким оно было несколько минут назад",
            "🛰️ На орбите астронавты не вне гравитации: станция и люди непрерывно падают вокруг Земли, поэтому внутри возникает невесомость",
        ],
        "физика": [
            "⚛️ Температура показывает среднюю энергию движения частиц, а не общий запас тепла: большая тёплая ванна может содержать больше энергии, чем раскалённая игла",
            "🌌 Вакуум не является абсолютной пустотой: в квантовой физике даже он описывается как состояние полей с флуктуациями",
        ],
        "химия": [
            "🧬 Запах вещества зависит от формы молекул и их связи с рецепторами носа, поэтому похожие молекулы иногда пахнут совершенно по-разному",
            "⚗️ Катализатор ускоряет реакцию, потому что предлагает молекулам путь с меньшим энергетическим барьером, сам при этом почти не расходуясь",
        ],
        "биология": [
            "🧬 ДНК в клетках тела почти одинакова, но кожа, мышцы и нейроны различаются, потому что включают разные наборы генов",
            "🔋 Митохондрии имеют собственную ДНК — след того, что их предки когда-то могли быть самостоятельными бактериями",
        ],
        "технологии": [
            "🤖 Нейросети не хранят знания как энциклопедию: они находят закономерности в данных, поэтому качество ответа зависит от обучения и проверки",
            "💾 Процессоры ускоряются не только частотой: кэш, параллелизм и специализированные блоки часто важнее простого роста мегагерц",
        ],
        "математика": [
            "➗ Доказательство ценно тем, что работает для всех случаев из условия задачи, а не только для примеров, которые удалось проверить",
            "0️⃣ Ноль стал ключевой идеей математики: он позволяет записывать позиционные числа и формально описывать отсутствие величины",
        ],
        "деревья": [
            "🌳 Деревья обмениваются веществами через грибные сети у корней: такая микориза помогает им получать воду и минералы",
            "🌲 Годичные кольца дерева отражают условия роста: широкие обычно появляются в благоприятные годы, узкие — при стрессе или засухе",
        ],
        "япония": [
            "🤬 В японском языке нет ругательств сильнее, чем «дурак» и «идиот»",
            "🗾 В Японии землетрясения так часты, потому что страна находится на стыке нескольких литосферных плит",
        ],
    }
    normalized = topic.strip().lower() or "наука"
    topic_facts = facts.get(normalized, facts["наука"])
    return random.choice(topic_facts)


async def generate_post(topic: str, config: AppConfig | None = None) -> str:
    config = config or load_config()
    providers = _provider_map(config)

    for provider_name in config.llm_provider_order:
        if provider_name == "local":
            break

        provider = providers.get(provider_name)
        if not provider or not provider.is_enabled:
            continue

        for model in provider.models:
            result = await _call_openai_compatible(provider, model, topic, config)
            if result:
                return result

    logger.info("Using local fallback post generator")
    return _local_post(topic)
