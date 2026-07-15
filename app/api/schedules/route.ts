import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { verifyChannelTarget } from '../channels/verification'

export const dynamic = 'force-dynamic'
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const MODES = ['normal', 'short', 'long', 'funny', 'wow', 'strict']

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
    if (!TIME_RE.test(postTime)) {
      return NextResponse.json({ error: 'invalid_time' }, { status: 400 })
    }

    const slotTopic = typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim().slice(0, 100) : null
    const slotMode = typeof body.mode === 'string' && body.mode.trim() ? body.mode.trim().slice(0, 30) : null
    if (slotMode && !MODES.includes(slotMode)) {
      return NextResponse.json({ error: 'invalid_mode' }, { status: 400 })
    }
    const channelId = body.channelId ? Number(body.channelId) : null

    const [channel] = channelId
      ? await sql`
          SELECT id, chat_id FROM channels
          WHERE id = ${channelId} AND user_id = ${user.userId} AND is_active AND is_verified AND bot_can_post
        `
      : await sql`
          SELECT id, chat_id FROM channels
          WHERE user_id = ${user.userId} AND is_active AND is_verified AND bot_can_post
          ORDER BY id LIMIT 1
        `
    if (!channel) {
      return NextResponse.json({ error: 'no_verified_channel' }, { status: 400 })
    }
    // A schedule cannot be enabled from stale database state: Telegram is the
    // authority for channel type and the bot's current posting permission.
    const verification = await verifyChannelTarget(String(channel.chat_id))
    if (!verification.ok || !verification.chatId || !verification.canPost) {
      await sql`
        UPDATE channels SET is_active = false, is_verified = false, bot_can_post = false,
          verified_at = now(), verification_error = ${verification.error || 'verification_failed'}, updated_at = now()
        WHERE id = ${channel.id} AND user_id = ${user.userId}
      `
      return NextResponse.json({ error: verification.error || 'verification_failed' }, { status: 422 })
    }
    await sql`
      UPDATE channels SET is_verified = true, bot_can_post = true,
        telegram_chat_id = ${verification.chatId}, telegram_title = ${verification.title || null},
        telegram_username = ${verification.username || null}, verified_at = now(),
        verification_error = null, updated_at = now()
      WHERE id = ${channel.id} AND user_id = ${user.userId}
    `

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
