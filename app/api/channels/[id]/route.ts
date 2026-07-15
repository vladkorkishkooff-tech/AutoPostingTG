import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { verifyChannelTarget } from '../verification'

export const dynamic = 'force-dynamic'

const IMAGE_POLICIES = ['auto', 'off', 'ai']
const MODES = ['normal', 'short', 'long', 'funny', 'wow', 'strict']

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { id } = await params
    const channelId = Number(id)
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return NextResponse.json({ error: 'bad_id' }, { status: 400 })
    }
    const body = await request.json()
    const [existing] = await sql`
      SELECT id, chat_id, is_verified FROM channels
      WHERE id = ${channelId} AND user_id = ${user.userId}
    `
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    if (body.reverify === true || body.isActive === true) {
      const verification = await verifyChannelTarget(String(existing.chat_id))
      if (!verification.ok || !verification.chatId || !verification.canPost) {
        await sql`
          UPDATE channels
          SET is_active = false, is_verified = false, bot_can_post = false,
              verified_at = now(), verification_error = ${verification.error || 'verification_failed'},
              updated_at = now()
          WHERE id = ${channelId} AND user_id = ${user.userId}
        `
        return NextResponse.json({ error: verification.error || 'verification_failed' }, { status: 422 })
      }
      await sql`
        UPDATE channels
        SET is_verified = true, bot_can_post = true, telegram_chat_id = ${verification.chatId},
            telegram_title = ${verification.title || null}, telegram_username = ${verification.username || null},
            verified_at = now(), verification_error = null,
            footer_title = COALESCE(footer_title, ${verification.title || null}),
            footer_url = COALESCE(footer_url, ${verification.username ? `https://t.me/${verification.username}` : null}),
            updated_at = now()
        WHERE id = ${channelId} AND user_id = ${user.userId}
      `
    }

    if (typeof body.isActive === 'boolean') {
      await sql`
        UPDATE channels SET is_active = ${body.isActive}, updated_at = now()
        WHERE id = ${channelId} AND user_id = ${user.userId}
      `
    }
    if (typeof body.topic === 'string') {
      const topic = body.topic.trim().slice(0, 120)
      if (!topic) return NextResponse.json({ error: 'invalid_topic' }, { status: 400 })
      await sql`UPDATE channels SET topic = ${topic}, updated_at = now() WHERE id = ${channelId} AND user_id = ${user.userId}`
    }
    if (typeof body.mode === 'string') {
      if (!MODES.includes(body.mode)) return NextResponse.json({ error: 'invalid_mode' }, { status: 400 })
      await sql`UPDATE channels SET mode = ${body.mode}, updated_at = now() WHERE id = ${channelId} AND user_id = ${user.userId}`
    }
    if (typeof body.title === 'string') {
      await sql`
        UPDATE channels SET title = ${body.title.trim().slice(0, 120) || null}, updated_at = now()
        WHERE id = ${channelId} AND user_id = ${user.userId}
      `
    }
    if (typeof body.imagePolicy === 'string') {
      if (!IMAGE_POLICIES.includes(body.imagePolicy)) {
        return NextResponse.json({ error: 'invalid_image_policy' }, { status: 400 })
      }
      await sql`
        UPDATE channels SET image_policy = ${body.imagePolicy}, updated_at = now()
        WHERE id = ${channelId} AND user_id = ${user.userId}
      `
    }
    const [channel] = await sql`
      SELECT id, chat_id, title, topic, mode, image_policy, is_active, is_verified,
             telegram_chat_id, telegram_title, telegram_username, bot_can_post,
             verified_at, verification_error
      FROM channels WHERE id = ${channelId} AND user_id = ${user.userId}
    `
    return NextResponse.json({ channel })
  } catch (error) {
    console.error('[channels] PATCH failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { id } = await params
    const channelId = Number(id)
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return NextResponse.json({ error: 'bad_id' }, { status: 400 })
    }
    const rows = await sql`
      UPDATE channels SET is_active = false, updated_at = now()
      WHERE id = ${channelId} AND user_id = ${user.userId}
      RETURNING id
    `
    if (!rows[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[channels] DELETE failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
