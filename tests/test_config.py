from config import load_config

def test_load_config_defaults():
    config = load_config()
    assert config.bot_token == "1234567890:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    assert config.channel_id == "-100123456"
    assert config.has_required_telegram_config is True
    assert config.database_url == "postgresql://test:test@localhost/test"
    assert config.post_style_example == "Пример тестового научного поста"
    assert config.default_topic == "наука"
    assert config.default_mode == "normal"

def test_get_int_invalid(monkeypatch):
    monkeypatch.setenv("POST_INTERVAL_HOURS", "not_a_number")
    config = load_config()
    assert config.post_interval_hours == 24

def test_get_list_parsing(monkeypatch):
    monkeypatch.setenv("ADMIN_USER_IDS", "123, 456, invalid, 789")
    config = load_config()
    assert config.admin_user_ids == {123, 456, 789}


def test_personal_telegram_id_is_not_a_channel(monkeypatch):
    monkeypatch.setenv("CHANNEL_ID", "1866588320")
    config = load_config()
    assert config.has_required_telegram_config is False
