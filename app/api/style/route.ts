import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type StyleProfile = {
  sample: string
  elements: string[]
  metrics: { brevity: number; factual: number; engagement: number; emojiScore: number }
  updatedAt: string
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const channels = await sql`
      SELECT id, coalesce(title, chat_id) AS title, style_profile
      FROM channels WHERE user_id = ${user.userId}
      ORDER BY id
    `
    return NextResponse.json({ channels })
  } catch (error) {
    console.error('[style] GET failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const body = await request.json()
    const channelId = Number(body.channelId)
    const sample = String(body.sample ?? '').trim().slice(0, 4000)
    const elements = Array.isArray(body.elements)
      ? body.elements.map((item: unknown) => String(item).trim().slice(0, 60)).filter(Boolean).slice(0, 12)
      : []
    if (!Number.isFinite(channelId) || sample.length < 20) {
      return NextResponse.json({ error: 'invalid_style' }, { status: 400 })
    }
    const metrics = {
      brevity: Math.max(0, Math.min(100, Number(body.metrics?.brevity) || 0)),
      factual: Math.max(0, Math.min(100, Number(body.metrics?.factual) || 0)),
      engagement: Math.max(0, Math.min(100, Number(body.metrics?.engagement) || 0)),
      emojiScore: Math.max(0, Math.min(100, Number(body.metrics?.emojiScore) || 0)),
    }
    const profile: StyleProfile = { sample, elements, metrics, updatedAt: new Date().toISOString() }
    const rows = await sql`
      UPDATE channels SET style_profile = ${JSON.stringify(profile)}::jsonb, updated_at = now()
      WHERE id = ${channelId} AND user_id = ${user.userId}
      RETURNING id, style_profile
    `
    if (!rows[0]) return NextResponse.json({ error: 'channel_not_found' }, { status: 404 })
    return NextResponse.json({ ok: true, profile: rows[0].style_profile })
  } catch (error) {
    console.error('[style] PUT failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
