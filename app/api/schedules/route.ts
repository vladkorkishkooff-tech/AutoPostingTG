import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const schedules = await sql`
      SELECT s.id, s.channel_id, s.post_time, s.days_of_week, s.timezone, s.is_active,
             s.topic AS slot_topic, s.mode AS slot_mode,
             c.chat_id, c.title AS channel_title, c.topic, c.mode
      FROM schedules s
      JOIN channels c ON c.id = s.channel_id
      WHERE c.user_id = ${user.userId}
      ORDER BY s.post_time
    `
    return NextResponse.json({ schedules })
  } catch (error) {
    console.error('[schedules] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const body = await request.json()
    const postTime = String(body.postTime ?? '')
    if (!/^\d{2}:\d{2}$/.test(postTime)) {
      return NextResponse.json({ error: 'invalid_time' }, { status: 400 })
    }

    const slotTopic = typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim().slice(0, 100) : null
    const slotMode = typeof body.mode === 'string' && body.mode.trim() ? body.mode.trim().slice(0, 30) : null
    const channelId = body.channelId ? Number(body.channelId) : null

    const [channel] = channelId
      ? await sql`SELECT id FROM channels WHERE id = ${channelId} AND user_id = ${user.userId}`
      : await sql`SELECT id FROM channels WHERE user_id = ${user.userId} ORDER BY id LIMIT 1`
    if (!channel) {
      return NextResponse.json({ error: 'no_channel' }, { status: 400 })
    }

    const [schedule] = await sql`
      INSERT INTO schedules (channel_id, post_time, topic, mode)
      VALUES (${channel.id}, ${postTime}, ${slotTopic}, ${slotMode})
      RETURNING id, channel_id, post_time, days_of_week, timezone, is_active, topic AS slot_topic, mode AS slot_mode
    `
    return NextResponse.json({ schedule }, { status: 201 })
  } catch (error) {
    console.error('[schedules] insert failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
