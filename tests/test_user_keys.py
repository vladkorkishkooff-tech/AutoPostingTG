import asyncio

from user_keys import is_public_https_url


def test_runtime_custom_endpoint_rejects_private_ip():
    assert asyncio.run(is_public_https_url("https://127.0.0.1/v1")) is False


def test_runtime_custom_endpoint_requires_https():
    assert asyncio.run(is_public_https_url("http://8.8.8.8/v1")) is False


def test_runtime_custom_endpoint_accepts_public_https_ip():
    assert asyncio.run(is_public_https_url("https://8.8.8.8/v1")) is True
