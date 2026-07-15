from ai_image import _gemini_keys, ai_image_available
from config import load_config


def test_user_gemini_key_enables_ai_image_without_env_key():
    config = load_config()
    providers = [
        {
            "key_id": 17,
            "name": "gemini",
            "api_key": "user-gemini-key",
            "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
            "models": ["gemini-2.5-flash"],
        }
    ]

    assert ai_image_available(config, providers)
    assert _gemini_keys(config, providers) == [("user-gemini-key", "gemini:user", 17)]


def test_non_gemini_user_key_does_not_enable_image_generation():
    config = load_config()
    providers = [{"key_id": 2, "name": "groq", "api_key": "groq-key"}]

    assert not ai_image_available(config, providers)
