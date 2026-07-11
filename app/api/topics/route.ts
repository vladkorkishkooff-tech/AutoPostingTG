import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { searchParams } = new URL(request.url)
    const channelId = Number(searchParams.get('channelId'))
    if (!Number.isFinite(channelId)) return NextResponse.json({ error: 'bad_channel' }, { status: 400 })

    const topics = await sql`
      SELECT t.id, t.topic, t.is_active, t.last_used_at
      FROM topic_pool t
      JOIN channels c ON c.id = t.channel_id
      WHERE t.channel_id = ${channelId} AND c.user_id = ${user.userId}
      ORDER BY t.id
    `
    return NextResponse.json({ topics })
  } catch (error) {
    console.error('[topics] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const body = await request.json()
    const channelId = Number(body.channelId)
    const topic = String(body.topic ?? '').trim().slice(0, 120)
    if (!Number.isFinite(channelId) || !topic) {
      return NextResponse.json({ error: 'bad_input' }, { status: 400 })
    }

    const [channel] = await sql`
      SELECT id FROM channels WHERE id = ${channelId} AND user_id = ${user.userId}
    `
    if (!channel) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const [row] = await sql`
      INSERT INTO topic_pool (channel_id, topic)
      VALUES (${channelId}, ${topic})
      ON CONFLICT (channel_id, topic) DO UPDATE SET is_active = true
      RETURNING id, topic, is_active, last_used_at
    `
    return NextResponse.json({ topic: row }, { status: 201 })
  } catch (error) {
    console.error('[topics] insert failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
