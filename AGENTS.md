# AGENTS.md

## Project Mission

AutoPostingTG generates and safely publishes science-content posts to Telegram. The bot must not duplicate, expose credentials, or publish outside an authorised channel.

## Project Context

- Next.js 16 Mini App in `app/`, deployed separately from the bot.
- Python 3.12 `aiogram` bot in `main.py`; its bridge is `bridge.py`.
- Neon/Postgres is shared by the Mini App and bot; SQL migrations live in `migrations/`.
- Telegram Web App `initData` authorises Mini App routes; API keys are AES-GCM encrypted.

## Commands

- Python install: `python -m pip install -r requirements.txt`
- Python syntax check: `python -m compileall -q main.py bridge.py config.py db.py migrate.py scheduler.py setup_commands.py ai_gen.py ai_image.py image_fetcher.py user_keys.py content_history.py`
- Web install: `pnpm install --frozen-lockfile`
- Web typecheck: `pnpm typecheck`
- Web build: `pnpm build`
- Database migration: `python migrate.py` (requires `DATABASE_URL`)
- Production environment check: `python production_check.py`
- Local bot: `python main.py`
- Docker bot: `docker compose up --build -d`
- Docker Desktop with host proxy: `docker compose -f docker-compose.yml -f docker-compose.local-proxy.yml up --build -d`
- Local Docker bot with the deployed Mini App: add `-f docker-compose.webapp.yml` to the compose command.
- Docker bridge (behind a host HTTPS proxy): `docker compose -f docker-compose.yml -f docker-compose.bridge.yml up -d`
- Temporary local HTTPS tunnel: add `-f docker-compose.tunnel.yml`; update Vercel `BOT_BRIDGE_URL` whenever the Quick Tunnel URL changes.

## Architecture Boundaries

- `app/api/` owns authenticated browser API routes; scope every database query by `userId`.
- `lib/auth.ts` validates Telegram Web App auth; never add development bypasses to production.
- `lib/crypto.ts` and `user_keys.py` must keep their compatible AES-GCM payload format.
- `db.py`, `scheduler.py`, and `main.py` own bot persistence and publication workflow.
- `bridge.py` accepts only requests with `BRIDGE_SECRET`; do not expose it without TLS and network controls.

## Security and Data

- Never commit `.env`, API keys, Telegram tokens, database URLs, or production data.
- Keep `ADMIN_USER_IDS`, `BRIDGE_SECRET`, `KEYS_ENCRYPTION_SECRET`, and `DATABASE_URL` mandatory for production.
- Add database changes as new, additive migration files; never rewrite an applied migration.
- Do not log API keys, Telegram init data, decrypted provider keys, or full bridge payloads.

## Quality Gates

- Run Python syntax checks after bot changes.
- Run `pnpm typecheck` and `pnpm build` after Mini App changes.
- Run migrations against a non-production database before production.
- Verify `/test`, a private `/preview`, then one intentional channel post before enabling a schedule.
- Do not start a second bot instance against the same channel without validating scheduler ownership.

## Working Rules

- Preserve public API contracts and user data; make no unrelated rewrites.
- Keep lockfiles in sync with package manifests.
- Do not suppress type, build, auth, or migration errors to make checks pass.
- Update `project.md` when deployment, schema, security, or architecture changes.
