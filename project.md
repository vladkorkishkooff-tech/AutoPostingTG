# Project

## Summary

- Name: AutoPostingTG
- Status: sale-ready pending owner Telegram acceptance test and credential rotation
- Goal: publish reviewed science-fact posts to authorised Telegram channels on a reliable schedule.
- Users: a Telegram channel owner using the bot and Mini App.
- Non-goals: public unauthenticated content management or generic social-media scheduling.

## Stack and Architecture

- Frontend/API: Next.js 16, React 19, TypeScript, deployed as a Telegram Mini App.
- Bot: Python 3.12, aiogram, aiohttp; `main.py` starts Telegram polling, scheduler, and optional bridge.
- Storage: Neon/Postgres through `@neondatabase/serverless` and asyncpg.
- Security: Telegram `initData` HMAC validation, user-scoped SQL, AES-256-GCM API-key encryption, shared bridge secret.
- Deployment: Vercel for the Mini App and Railway/Docker for the long-running bot and HTTPS bridge.

## Main Workflows

1. Mini App verifies Telegram identity, manages channels/keys/schedules, and invokes the bot through the secret-protected bridge.
2. The bot generates a post, picks media, records the result, and publishes it to a configured channel.
3. Scheduler pre-generates queued posts and claims time slots atomically to avoid duplicate publications.

## Database

- The schema is versioned in `migrations/` and applied by `migrate.py` or the Docker entrypoint.
- Key entities: users, channels, schedules, posts, topic pool, provider keys, usage events, and channel metrics.
- Migrations are additive and serialised with a PostgreSQL advisory lock.

## Release Gates

- `pnpm install --frozen-lockfile && pnpm typecheck && pnpm build`
- Python dependency install and syntax check.
- `python production_check.py` before starting the production container.
- Migration run against a non-production database, then backup-verified production migration.
- Telegram smoke test: `/test` → private `/preview` → one explicit channel post → scheduled post.
- Verify bot admin permissions and that `ADMIN_USER_IDS` contains only the owner.

## Known Risks

- The Mini App needs a real Telegram Web App context in production; browser-only testing returns 401 by design.
- The bridge must be reachable by the Mini App only over HTTPS/private networking and protected with a strong secret.
- The default Docker compose configuration does not expose the bridge; `docker-compose.bridge.yml` binds it to loopback for an HTTPS reverse proxy.
- Local end-to-end testing can use `docker-compose.tunnel.yml` and a temporary Cloudflare Quick Tunnel; it is not a durable production endpoint.
- `WEB_APP_URL` is the HTTPS Mini App URL used to configure the bot's Telegram menu button at startup.
- 2026-07-12: Mini App deployed to `https://autoposting-tg.vercel.app` in the Vercel production project.
- 2026-07-12: Railway is the production host for the bot bridge; it binds to Railway's injected `PORT` and is protected with `BRIDGE_SECRET`.
- 2026-07-12: Stock-image search uses the generated draft as context, prioritises the most specific visual query, and rotates alternatives only on an explicit retry.
- 2026-07-12: Gemini supports comma-separated API keys and failover rotation: each key is attempted in order before the next configured provider.
- AI/image providers have external quotas and outages; keep at least one paid or reliable fallback configured.
- `api/` and `web/` are obsolete local prototypes and are ignored; the supported Mini App is the root `app/` project.
- Outside Telegram, production renders an instructional gate and does not call authenticated API routes without `initData`.
- 2026-07-13 production smoke: Vercel UI/API boundary, Railway health/auth boundary, Gemini preview, Pexels image lookup, and browser console all passed without a channel publication.
- 2026-07-13: Rotated Neon/Pexels credentials were synchronised to Vercel and Railway. Signed Telegram `initData`, database access, Gemini preview, Pexels lookup, and bot channel permissions passed in production.
- 2026-07-13: Stock images now follow a visual-editor pipeline: the finished post is converted into concrete English queries, candidate metadata must overlap the query, astronomy prioritises NASA/Wikimedia, and unknown topics no longer fall back to a generic `science research` image.
- 2026-07-13 production verification: the Titan methane-rain example produced `Titan methane rain`, selected a relevant NASA Titan asset, and downloaded a valid Telegram-sized JPEG; Railway and Vercel deployments are healthy.
- 2026-07-13: Image matching was tightened to structured visual plans with an exact subject, focal feature, and mandatory metadata anchors; broad whole-object matches are rejected when the post is specifically about a part or phenomenon.
- 2026-07-13 production verification: Olympus Mons requires `olympus + mons + volcano` and selects a labelled shield-volcano image; the giant-squid-eye post requires `giant + squid + eye` and selects an actual eye close-up. Historical image URLs no longer rotate search away from the most exact query.
- 2026-07-13: Mini App generation and media selection are serialised: regeneration explicitly avoids the current draft and invalidates its photo, while topic/mode/manual-text changes also clear stale media. Stock search is disabled until a current preview exists.
- 2026-07-13: Visual-plan anchors distinguish the broad visible feature from metadata-fragile subdetails; for example, an eye lens still searches and validates `giant + squid + eye`, with `lens` kept as an optional query detail.

## Change Log

- 2026-07-15: Deduplicated NASA stock-image size renditions by archive asset ID
  so the three Mini App candidates are genuinely different images.
- 2026-07-15: Added migration 005 and verified-target filters so legacy schedules,
  queued posts, History and Stats cannot expose or execute personal Telegram IDs.
- 2026-07-15: Added opt-in 2–5 batch generation with selected drafts going to Queue, Queue text regeneration/manual retry, server-side mode/format validation, database-backed rate limits, runtime custom-endpoint DNS checks, provider-key usage tracking, pinned Python dependencies, release metadata, and CI migration/Docker/secret gates.
- 2026-07-14: Replaced decorative Style, Media, Provider, Settings, and usage-stat surfaces with persistent user-scoped workflows. Channel style profiles now use additive JSONB schema, provider order/toggles affect encrypted user-key selection, media can be attached to a selected queued post, and image replacement preserves the current image on structured failures.
- 2026-07-14: User Gemini keys are accepted by the stock-query and AI-image Python contracts, image providers use a circuit breaker, and exact subject/focal-detail validation rejects broad metadata-only matches.
- 2026-07-11: Added tracked Postgres schema migrations, an idempotent migration runner, Docker startup migration, compose configuration, and project operating rules.
- 2026-07-12: Isolated tests from real secrets, updated stale tests to the current JSON/Postgres architecture, hardened production auth and bridge secret checks, bounded bridge uploads, blocked private-network image downloads, added explicit channel routing to the Mini App generator, and made Neon initialisation build-safe.
