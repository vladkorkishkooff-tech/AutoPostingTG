# External automation API — planned contract

## Goal

Allow Codex, Gemini-based agents, n8n, Make, Notion automations, or another
customer-owned service to create work in AutoPostingTG without receiving the
Telegram bot token or direct database access.

An LLM does not run on a schedule by itself. A scheduler (AutoPostingTG,
n8n/Make, or the agent platform) wakes it up and sends one HTTPS request to the
incoming API.

## Safe workflow

```text
external scheduler/agent
        |
        | POST /api/integrations/v1/jobs
        v
authenticated intake + idempotency
        |
        v
jobs / posts in Neon
        |
        v
Mini App review queue
        |
        v
Railway scheduler -> Telegram channel
```

The default integration permission is `draft:create`: an external system can
create a draft, but cannot publish it. Optional `post:approve` may be enabled by
the channel owner for a trusted integration. Direct synchronous publication is
not part of the public contract.

## Proposed request

```http
POST /api/integrations/v1/jobs
Authorization: Bearer atg_live_...
Idempotency-Key: customer-task-2026-07-16
Content-Type: application/json
```

Generate content inside AutoPostingTG:

```json
{
  "channelId": 4,
  "kind": "generate",
  "topic": "необычные факты о космосе",
  "mode": "wow",
  "count": 3,
  "imagePolicy": "stock",
  "runAt": "2026-07-16T09:00:00+03:00"
}
```

Or submit a ready draft produced by an external agent:

```json
{
  "channelId": 4,
  "kind": "draft",
  "text": "Готовый текст поста...",
  "topic": "космос",
  "imagePolicy": "stock",
  "publishAt": "2026-07-16T12:00:00+03:00"
}
```

The response returns an addressable job ID and never waits for Telegram:

```json
{
  "jobId": "job_01...",
  "status": "accepted",
  "statusUrl": "/api/integrations/v1/jobs/job_01..."
}
```

## Required implementation

1. Add integration tokens stored only as hashes, with channel and scope limits.
2. Add durable `integration_jobs` and idempotency records in an additive
   migration.
3. Add authenticated create/status/cancel Route Handlers.
4. Process jobs on Railway with retry/backoff and an outbox-style claim.
5. Show source, status, errors, cost, and approve/reject actions in Mini App.
6. Add per-integration daily limits, audit events, token rotation, and revoke.
7. Cover duplicate delivery, provider timeout, invalid image URL, revoked token,
   and cross-owner isolation in integration tests.

## Product behaviour

- A customer can keep AutoPostingTG's own schedule and also accept external
  jobs; both end in the same review queue and publication pipeline.
- Each external task chooses `count` and `imagePolicy` (`off`, `stock`, or
  `ai`).
- `Idempotency-Key` guarantees that a retry cannot create the same post twice.
- The buyer owns all provider keys and can revoke one integration without
  stopping the bot.
- Notion is a content source, not a scheduler by itself; connect it through a
  Notion automation, n8n, Make, or a small scheduled agent.
