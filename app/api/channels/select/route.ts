import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()

    let body: { channelId?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    const channelId = Number(body.channelId)
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return NextResponse.json({ error: 'invalid_channel_id' }, { status: 400 })
    }

    // Проверяем, что канал принадлежит пользователю
    const [channel] = await sql`
      SELECT id, chat_id, title, topic, mode, image_policy, is_active, is_verified, bot_can_post
      FROM channels
      WHERE id = ${channelId} AND user_id = ${user.userId}
        AND (chat_id ~ '^@[A-Za-z0-9_]{5,32}$' OR chat_id ~ '^-100[0-9]{6,}$')
    `
    if (!channel) {
      return NextResponse.json({ error: 'channel_not_found' }, { status: 404 })
    }

    // Обновляем выбранный канал пользователя в БД
    await sql`
      UPDATE users
      SET selected_channel_id = ${channelId}, updated_at = now()
      WHERE id = ${user.userId}
    `

    return NextResponse.json({
      ok: true,
      selectedChannelId: channelId,
      channel,
    })
  } catch (error) {
    console.error('[channels/select] failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
