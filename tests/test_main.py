from unittest.mock import MagicMock

from aiogram import types

from config import load_config
from main import _is_allowed, _normalize_topic, _parse_command_args


def test_normalize_topic_empty():
    config = load_config()
    assert _normalize_topic(None) == config.default_topic
    assert _normalize_topic("") == config.default_topic
    assert _normalize_topic("   ") == config.default_topic
    assert _normalize_topic("биология") == "биология"


def test_parse_command_args_with_mode():
    config = load_config()
    parsed = _parse_command_args("funny космос")
    assert parsed.mode == "funny"
    assert parsed.topic == "космос"


def test_parse_command_args_without_mode():
    config = load_config()
    parsed = _parse_command_args("космос")
    # Если первое слово не режим, то берется дефолтный режим, а всё слово идет в тему
    assert parsed.mode == config.default_mode
    assert parsed.topic == "космос"


def test_is_allowed_empty_admin_ids(monkeypatch):
    monkeypatch.setenv("ADMIN_USER_IDS", "")
    config = load_config()
    message = MagicMock(spec=types.Message)
    message.from_user = MagicMock()
    message.from_user.id = 999

    # Чтобы функция _is_allowed использовала новый конфиг, нам нужно замокать config внутри main
    import main
    main.config = config

    assert main._is_allowed(message) is True


def test_is_allowed_with_admin_ids(monkeypatch):
    monkeypatch.setenv("ADMIN_USER_IDS", "123, 456")
    config = load_config()

    import main
    main.config = config

    message = MagicMock(spec=types.Message)
    message.from_user = MagicMock()

    message.from_user.id = 123
    assert main._is_allowed(message) is True

    message.from_user.id = 999
    assert main._is_allowed(message) is False
