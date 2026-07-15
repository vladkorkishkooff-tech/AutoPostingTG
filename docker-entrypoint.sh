#!/bin/sh
set -eu

# Production compose sets this flag to fail closed when a required secret or
# owner restriction is missing.
if [ "${REQUIRE_PRODUCTION_CONFIG:-0}" = "1" ]; then
  python production_check.py
fi

# DATABASE_URL enables the shared Postgres workflow. Migrations are idempotent
# and use an advisory lock, so a restart or a second instance is safe.
if [ -n "${DATABASE_URL:-}" ]; then
  python migrate.py
fi

exec python main.py
