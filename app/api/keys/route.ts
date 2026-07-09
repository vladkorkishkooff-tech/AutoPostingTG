import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { encryptSecret, keyHint } from '@/lib/crypto'
import { providerById } from '@/lib/providers-catalog'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const keys = await sql`
      SELECT id, provider, model, label, base_url, key_hint, priority, is_active, last_used_at, last_error, created_at
      FROM api_keys WHERE user_id = ${user.userId}
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
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
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

    const inserted = (await sql`
      INSERT INTO api_keys (user_id, provider, model, label, base_url, encrypted_key, key_hint, priority)
      VALUES (
        ${user.userId}, ${provider}, ${model}, ${label}, ${baseUrl},
        ${encryptSecret(apiKey)}, ${keyHint(apiKey)},
        COALESCE((SELECT MAX(priority) + 1 FROM api_keys WHERE user_id = ${user.userId}), 0)
      )
      RETURNING id, provider, model, label, base_url, key_hint, priority, is_active, created_at
    `) as Record<string, unknown>[]

    return NextResponse.json({ key: inserted[0] })
  } catch (error) {
    console.error('[v0] keys POST error:', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
