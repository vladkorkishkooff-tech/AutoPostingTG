import os

import pytest

# Keep test collection isolated from the developer's real .env. Some modules
# load configuration at import time, before pytest fixtures are entered.
os.environ.update(
    {
        "BOT_TOKEN": "1234567890:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "CHANNEL_ID": "-100123456",
        "DATABASE_URL": "postgresql://test:test@localhost/test",
        "ADMIN_USER_IDS": "123",
        "BRIDGE_SECRET": "test_bridge_secret_at_least_32_chars",
        "KEYS_ENCRYPTION_SECRET": "test_encryption_secret_32_chars_min",  # gitleaks:allow; deterministic test value
        "GROQ_API_KEY": "",
        "MISTRAL_API_KEY": "",
        "GEMINI_API_KEY": "",
        "GEMINI_API_KEYS": "",
        "NVIDIA_API_KEY": "",
        "OPENROUTER_API_KEY": "",
        "OPENROUTER_KEY": "",
        "CUSTOM_OPENAI_API_KEY": "",
        "V0_API_KEY": "",
        "PIXABAY_API_KEY": "",
        "PEXELS_API_KEY": "",
        "UNSPLASH_ACCESS_KEY": "",
    }
)

@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "1234567890:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
    monkeypatch.setenv("CHANNEL_ID", "-100123456")
    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@localhost/test")
    monkeypatch.setenv("POST_STYLE_EXAMPLE", "Пример тестового научного поста")
