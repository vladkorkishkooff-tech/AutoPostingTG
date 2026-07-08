import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET() {
  try {
    const schedules = await sql`
      SELECT s.id, s.post_time, s.days_of_week, s.timezone, s.is_active,
             c.chat_id, c.topic, c.mode
      FROM schedules s
      JOIN channels c ON c.id = s.channel_id
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
    const body = await request.json()
    const postTime = String(body.postTime ?? '')
    if (!/^\d{2}:\d{2}$/.test(postTime)) {
      return NextResponse.json({ error: 'invalid_time' }, { status: 400 })
    }

    const [channel] = await sql`SELECT id FROM channels ORDER BY id LIMIT 1`
    if (!channel) {
      return NextResponse.json({ error: 'no_channel' }, { status: 400 })
    }

    const [schedule] = await sql`
      INSERT INTO schedules (channel_id, post_time)
      VALUES (${channel.id}, ${postTime})
      RETURNING id, post_time, days_of_week, timezone, is_active
    `
    return NextResponse.json({ schedule }, { status: 201 })
  } catch (error) {
    console.error('[schedules] insert failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
