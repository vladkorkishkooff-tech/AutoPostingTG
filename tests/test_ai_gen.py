from dataclasses import replace

import ai_gen
from ai_gen import (
    MAX_GENERATION_ATTEMPTS,
    _is_distinct_post,
    _is_usable_post,
    _system_prompt,
    _trim_for_telegram,
    generate_post,
    is_mode_token,
    normalize_mode,
)
from config import load_config

def test_normalize_mode_aliases():
    assert normalize_mode("смешной") == "funny"
    assert normalize_mode("wow") == "wow"
    assert normalize_mode("строго") == "strict"
    assert normalize_mode("коротко") == "short"
    assert normalize_mode("лонгрид") == "long"
    assert normalize_mode("unknown") == "normal"

def test_normalize_mode_default():
    assert normalize_mode(None) == "normal"
    assert normalize_mode("") == "normal"

def test_is_mode_token():
    assert is_mode_token("смешной") is True
    assert is_mode_token("wow") is True
    assert is_mode_token("космос") is False
    assert is_mode_token("") is False

def test_trim_for_telegram():
    long_text = "A" * 500
    trimmed = _trim_for_telegram(long_text, limit=430)
    assert len(trimmed) == 430
    assert trimmed.endswith("...")


def test_long_mode_preserves_paragraphs_and_validates_structure():
    text = "🪐 " + ("Марс содержит железистые минералы, которые окисляются и окрашивают поверхность. " * 3)
    text += "\n\n" + ("Этот процесс происходил при участии воды и атмосферы в далёком прошлом планеты. " * 3)
    normalized = _trim_for_telegram(text, limit=1800, preserve_paragraphs=True)
    assert "\n\n" in normalized
    assert _is_usable_post(normalized, "long") is True


def test_validation_rejects_truncated_or_linked_drafts():
    assert _is_usable_post("🧪 " + "Научный факт на русском языке " * 4 + "...", "normal") is False
    assert _is_usable_post("🧪 Подробнее https://example.com " + "научный факт " * 6, "normal") is False

def test_trim_removes_prefixes():
    assert _trim_for_telegram("Конечно, вот факт: Вода мокрая.") == "вот факт: Вода мокрая."
    assert _trim_for_telegram("Факт: Вода мокрая.") == "Вода мокрая."

def test_system_prompt_contains_mode():
    config = load_config()
    prompt = _system_prompt("funny", config)
    assert "лёгкой иронией" in prompt
    assert "Telegram-канала о науке" in prompt
    assert config.post_style_example in prompt


def test_system_prompt_uses_trusted_style_profile():
    config = load_config()
    prompt = _system_prompt(
        "long",
        config,
        style_profile={"sample": "🧬 Пример авторской подачи", "elements": ["краткие абзацы", "без воды"]},
    )
    assert "500-1200" in prompt
    assert "Пример авторской подачи" in prompt
    assert "краткие абзацы" in prompt


def test_distinct_post_rejects_reworded_duplicate():
    previous = "🌋 Олимп на Марсе — самый высокий вулкан в Солнечной системе, его высота около 26 км."
    duplicate = "🌋 Олим на Марсе — самый высокий в Солнечной системе: он достигает 26 км."
    different = "🪐 Марсианские закаты выглядят голубыми: мелкая пыль рассеивает синий свет вокруг Солнца."

    assert _is_distinct_post(duplicate, [previous]) is False
    assert _is_distinct_post(different, [previous]) is True


async def test_generate_post_skips_duplicate_and_uses_next_model(monkeypatch):
    config = replace(load_config(), llm_provider_order=[])
    responses = iter(
        [
            "🌋 Олим на Марсе — самый высокий вулкан Солнечной системы, его высота около 26 км.",
            "🪐 Марсианские закаты выглядят голубыми: пыль избирательно рассеивает синий свет вокруг Солнца.",
        ]
    )
    calls = []

    async def fake_call(provider, model, topic, mode, config, avoid_texts, style_profile):
        calls.append(model)
        return next(responses)

    monkeypatch.setattr(ai_gen, "_call_openai_compatible", fake_call)
    old = "🌋 Олим на Марсе — самый высокий вулкан Солнечной системы, его высота около 26 км."
    result = await generate_post(
        "Марс",
        config,
        avoid_texts=[old],
        user_providers=[
            {"name": "test", "base_url": "https://example.test/v1", "api_key": "key", "models": ["one", "two"]}
        ],
    )

    assert calls == ["one", "two"]
    assert result and "закаты" in result


async def test_generate_post_has_hard_attempt_limit(monkeypatch):
    config = replace(load_config(), llm_provider_order=[])
    calls = 0

    async def duplicate_call(provider, model, topic, mode, config, avoid_texts, style_profile):
        nonlocal calls
        calls += 1
        return "🦠 Бактерии обмениваются генами через горизонтальный перенос, даже если они не являются родственниками."

    monkeypatch.setattr(ai_gen, "_call_openai_compatible", duplicate_call)
    duplicate = "🦠 Бактерии обмениваются генами через горизонтальный перенос, даже если они не являются родственниками."
    result = await generate_post(
        "бактерии",
        config,
        avoid_texts=[duplicate],
        user_providers=[
            {
                "name": "test",
                "base_url": "https://example.test/v1",
                "api_key": "key",
                "models": [f"model-{index}" for index in range(MAX_GENERATION_ATTEMPTS + 5)],
            }
        ],
    )

    assert result is None
    assert calls == MAX_GENERATION_ATTEMPTS


async def test_generate_post_dispatches_anthropic_to_native_adapter(monkeypatch):
    config = replace(load_config(), llm_provider_order=[])
    calls = []

    async def native_call(provider, model, topic, mode, config, avoid_texts, style_profile):
        calls.append((provider.name, model, style_profile))
        return "🧬 ДНК человека в одной клетке растянулась бы примерно на два метра, но белки упаковывают её в микроскопическом ядре."

    async def wrong_adapter(*args, **kwargs):
        raise AssertionError("Anthropic must not use /chat/completions")

    monkeypatch.setattr(ai_gen, "_call_anthropic", native_call)
    monkeypatch.setattr(ai_gen, "_call_openai_compatible", wrong_adapter)
    profile = {"sample": "тестовый стиль"}
    result = await generate_post(
        "ДНК",
        config,
        user_providers=[
            {
                "name": "anthropic",
                "base_url": "https://api.anthropic.com/v1",
                "api_key": "key",
                "models": ["claude-haiku-4-5"],
            }
        ],
        style_profile=profile,
    )

    assert result and "микроскопическом" in result
    assert calls == [("anthropic", "claude-haiku-4-5", profile)]
