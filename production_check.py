"""Fail-fast validation for a production bot configuration.

It intentionally reports variable names only, never their values.
"""

from __future__ import annotations

import os
import re
import sys

from dotenv import load_dotenv

load_dotenv()

REQUIRED = (
    "BOT_TOKEN",
    "CHANNEL_ID",
    "ADMIN_USER_IDS",
    "DATABASE_URL",
    "KEYS_ENCRYPTION_SECRET",
    "BRIDGE_SECRET",
)
PLACEHOLDERS = ("change_me", "your_", "1234567890:telegram_bot_token")
CHANNEL_TARGET_RE = re.compile(r"^(?:@[A-Za-z0-9_]{5,32}|-100\d{6,})$")


def present(name: str) -> bool:
    value = os.getenv(name, "").strip()
    return bool(value) and not any(marker in value.lower() for marker in PLACEHOLDERS)


def main() -> int:
    missing = [name for name in REQUIRED if not present(name)]
    if os.getenv("ALLOW_DEV_AUTH", "").strip() == "1":
        missing.append("ALLOW_DEV_AUTH must not be 1 in production")
    if present("ADMIN_USER_IDS"):
        invalid_ids = [part.strip() for part in os.environ["ADMIN_USER_IDS"].split(",") if not part.strip().isdigit()]
        if invalid_ids:
            missing.append("ADMIN_USER_IDS must contain numeric Telegram IDs only")
    if present("CHANNEL_ID") and not CHANNEL_TARGET_RE.fullmatch(os.environ["CHANNEL_ID"].strip()):
        missing.append("CHANNEL_ID must be @channel_username or a -100... Telegram channel ID")
    for name in ("KEYS_ENCRYPTION_SECRET", "BRIDGE_SECRET"):
        if present(name) and len(os.environ[name].strip()) < 32:
            missing.append(f"{name} must be at least 32 characters")

    if missing:
        print("Production configuration is incomplete:", file=sys.stderr)
        for item in missing:
            print(f"- {item}", file=sys.stderr)
        return 1

    print("Production configuration check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
