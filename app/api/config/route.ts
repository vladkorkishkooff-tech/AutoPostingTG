import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

const KNOWN_PROVIDERS = ['groq', 'mistral', 'gemini', 'nvidia', 'openrouter', 'custom']

export async function GET() {
  try {
    const [channel] = await sql`
      SELECT chat_id, title, topic, mode, is_active FROM channels ORDER BY id LIMIT 1
    `
    const settings = await sql`
      SELECT provider, priority, is_enabled FROM provider_settings ORDER BY priority
    `
    const providers =
      settings.length > 0
        ? settings
        : KNOWN_PROVIDERS.map((provider, priority) => ({ provider, priority, is_enabled: true }))

    return NextResponse.json({ channel: channel ?? null, providers })
  } catch (error) {
    console.error('[config] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
