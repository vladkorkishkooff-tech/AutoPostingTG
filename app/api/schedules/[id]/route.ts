import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { verifyChannelTarget } from '../../channels/verification'

export const dynamic = 'force-dynamic'

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const MODES = ['normal', 'short', 'long', 'funny', 'wow', 'strict']

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { id } = await params
    const scheduleId = Number(id)
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return NextResponse.json({ error: 'bad_id' }, { status: 400 })
    }
    const body = await request.json()
    const [existing] = await sql`
      SELECT s.id, c.id AS channel_id, c.chat_id
      FROM schedules s JOIN channels c ON c.id = s.channel_id
      WHERE s.id = ${scheduleId} AND c.user_id = ${user.userId}
    `
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    if (body.isActive === true) {
      const verification = await verifyChannelTarget(String(existing.chat_id))
      if (!verification.ok || !verification.chatId || !verification.canPost) {
        await sql`
          UPDATE channels SET is_active = false, is_verified = false, bot_can_post = false,
            verified_at = now(), verification_error = ${verification.error || 'verification_failed'}, updated_at = now()
          WHERE id = ${existing.channel_id} AND user_id = ${user.userId}
        `
        return NextResponse.json({ error: verification.error || 'verification_failed' }, { status: 422 })
      }
      await sql`
        UPDATE channels SET is_verified = true, bot_can_post = true,
          telegram_chat_id = ${verification.chatId}, telegram_title = ${verification.title || null},
          telegram_username = ${verification.username || null}, verified_at = now(),
          verification_error = null, updated_at = now()
        WHERE id = ${existing.channel_id} AND user_id = ${user.userId}
      `
    }

    if (typeof body.isActive === 'boolean') {
      await sql`
        UPDATE schedules s SET is_active = ${body.isActive}, updated_at = now()
        FROM channels c
        WHERE s.id = ${scheduleId} AND s.channel_id = c.id AND c.user_id = ${user.userId}
      `
    }
    if (typeof body.postTime === 'string') {
      if (!TIME_RE.test(body.postTime)) return NextResponse.json({ error: 'invalid_time' }, { status: 400 })
      await sql`
        UPDATE schedules s SET post_time = ${body.postTime}, updated_at = now()
        FROM channels c
        WHERE s.id = ${scheduleId} AND s.channel_id = c.id AND c.user_id = ${user.userId}
      `
    }
    if ('topic' in body) {
      const topic = typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim().slice(0, 100) : null
      await sql`
        UPDATE schedules s SET topic = ${topic}, updated_at = now()
        FROM channels c
        WHERE s.id = ${scheduleId} AND s.channel_id = c.id AND c.user_id = ${user.userId}
      `
    }
    if ('mode' in body) {
      const mode = typeof body.mode === 'string' && body.mode.trim() ? body.mode.trim() : null
      if (mode && !MODES.includes(mode)) return NextResponse.json({ error: 'invalid_mode' }, { status: 400 })
      await sql`
        UPDATE schedules s SET mode = ${mode}, updated_at = now()
        FROM channels c
        WHERE s.id = ${scheduleId} AND s.channel_id = c.id AND c.user_id = ${user.userId}
      `
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[schedules] PATCH failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { id } = await params
    const scheduleId = Number(id)
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return NextResponse.json({ error: 'bad_id' }, { status: 400 })
    }
    const rows = await sql`
      DELETE FROM schedules s USING channels c
      WHERE s.id = ${scheduleId} AND s.channel_id = c.id AND c.user_id = ${user.userId}
      RETURNING s.id
    `
    if (!rows[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[schedules] DELETE failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
