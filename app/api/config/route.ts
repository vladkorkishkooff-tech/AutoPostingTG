import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function bridgeOnline(): Promise<boolean> {
  const bridgeUrl = process.env.BOT_BRIDGE_URL
  if (!bridgeUrl) return false
  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, '')}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const [channels, providers, online] = await Promise.all([
      sql`
        SELECT id, chat_id, title, topic, mode, is_active, is_verified, bot_can_post,
               verification_error
        FROM channels
        WHERE user_id = ${user.userId}
          AND (chat_id ~ '^@[A-Za-z0-9_]{5,32}$' OR chat_id ~ '^-100[0-9]{6,}$')
        ORDER BY id
      `,
      sql`
        WITH names AS (
          SELECT provider FROM api_keys WHERE user_id = ${user.userId}
          UNION
          SELECT provider FROM provider_settings WHERE user_id = ${user.userId}
        ), key_state AS (
          SELECT provider,
                 count(*) FILTER (WHERE is_active) AS active_keys,
                 bool_or(is_active AND last_error IS NULL) AS has_healthy_key,
                 max(last_error) FILTER (WHERE is_active AND last_error IS NOT NULL) AS last_error,
                 min(priority) FILTER (WHERE is_active) AS key_priority
          FROM api_keys WHERE user_id = ${user.userId} GROUP BY provider
        )
        SELECT n.provider,
               coalesce(s.priority, k.key_priority, 999)::int AS priority,
               coalesce(s.is_enabled, true) AS is_enabled,
               coalesce(k.active_keys, 0)::int AS active_keys,
               coalesce(k.has_healthy_key, false) AS has_healthy_key,
               k.last_error
        FROM names n
        LEFT JOIN provider_settings s ON s.user_id = ${user.userId} AND s.provider = n.provider
        LEFT JOIN key_state k ON k.provider = n.provider
        ORDER BY priority, n.provider
      `,
      bridgeOnline(),
    ])
    return NextResponse.json({
      channel: channels[0] ?? null,
      channels,
      providers,
      runtime: {
        bridgeOnline: online,
        bridgeConfigured: Boolean(process.env.BOT_BRIDGE_URL && process.env.BRIDGE_SECRET),
        proxyManagedBy: 'Railway bot environment',
        proxyVariables: ['TELEGRAM_PROXY_URL', 'OUTBOUND_PROXY_URL'],
        keyStorage: 'AES-256-GCM encrypted in Postgres',
        version: process.env.NEXT_PUBLIC_APP_VERSION || '1.1.0',
        commit: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.RELEASE_SHA || '').slice(0, 12) || null,
      },
    })
  } catch (error) {
    console.error('[config] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const body = await request.json()
    const providers = Array.isArray(body.providers) ? body.providers.slice(0, 30) : null
    if (!providers) return NextResponse.json({ error: 'invalid_providers' }, { status: 400 })

    for (let priority = 0; priority < providers.length; priority += 1) {
      const provider = String(providers[priority]?.provider ?? '').trim().toLowerCase()
      if (!/^[a-z0-9_-]{1,40}$/.test(provider)) {
        return NextResponse.json({ error: 'invalid_provider' }, { status: 400 })
      }
      const enabled = providers[priority]?.is_enabled !== false
      await sql`
        INSERT INTO provider_settings (user_id, provider, priority, is_enabled)
        VALUES (${user.userId}, ${provider}, ${priority}, ${enabled})
        ON CONFLICT (user_id, provider) DO UPDATE
          SET priority = EXCLUDED.priority, is_enabled = EXCLUDED.is_enabled
      `
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[config] update failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
