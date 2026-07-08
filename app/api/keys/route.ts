import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { encryptSecret, keyHint } from '@/lib/crypto'
import { providerById } from '@/lib/providers-catalog'

export const dynamic = 'force-dynamic'

// MVP: единственный владелец (первый пользователь). После добавления
// Telegram initData-авторизации заменить на сессионного пользователя.
async function ownerId(): Promise<number | null> {
  const rows = (await sql`SELECT id FROM users ORDER BY id LIMIT 1`) as { id: number }[]
  return rows[0]?.id ?? null
}

export async function GET() {
  try {
    const uid = await ownerId()
    if (!uid) return NextResponse.json({ keys: [] })
    const keys = await sql`
      SELECT id, provider, model, label, base_url, key_hint, priority, is_active, last_used_at, last_error, created_at
      FROM api_keys WHERE user_id = ${uid}
      ORDER BY priority ASC, id ASC
    `
    return NextResponse.json({ keys })
  } catch (error) {
    console.error('[v0] keys GET error:', error)
    return NextResponse.json({ keys: [], error: 'db_error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const provider = String(body.provider || '').trim()
    const apiKey = String(body.apiKey || '').trim()
    const model = body.model ? String(body.model).trim() : null
    const label = body.label ? String(body.label).trim() : null
    let baseUrl = body.baseUrl ? String(body.baseUrl).trim() : null

    if (!provider || !apiKey) {
      return NextResponse.json({ error: 'provider and apiKey are required' }, { status: 400 })
    }
    const def = providerById(provider)
    if (!def) return NextResponse.json({ error: 'unknown provider' }, { status: 400 })
    if (def.needsBaseUrl && !baseUrl) {
      return NextResponse.json({ error: 'baseUrl is required for custom provider' }, { status: 400 })
    }
    if (!baseUrl) baseUrl = def.baseUrl ?? null

    const uid = await ownerId()
    if (!uid) return NextResponse.json({ error: 'no owner user yet' }, { status: 409 })

    const inserted = (await sql`
      INSERT INTO api_keys (user_id, provider, model, label, base_url, encrypted_key, key_hint, priority)
      VALUES (
        ${uid}, ${provider}, ${model}, ${label}, ${baseUrl},
        ${encryptSecret(apiKey)}, ${keyHint(apiKey)},
        COALESCE((SELECT MAX(priority) + 1 FROM api_keys WHERE user_id = ${uid}), 0)
      )
      RETURNING id, provider, model, label, base_url, key_hint, priority, is_active, created_at
    `) as Record<string, unknown>[]

    return NextResponse.json({ key: inserted[0] })
  } catch (error) {
    console.error('[v0] keys POST error:', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
