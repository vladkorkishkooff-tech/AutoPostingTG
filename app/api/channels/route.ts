import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const IMAGE_POLICIES = ['auto', 'off', 'ai']

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const channels = await sql`
      SELECT c.id, c.chat_id, c.title, c.topic, c.mode, c.image_policy, c.is_active,
             count(s.id) FILTER (WHERE s.is_active) AS active_schedules,
             count(p.id) FILTER (WHERE p.status = 'published') AS published_posts
      FROM channels c
      LEFT JOIN schedules s ON s.channel_id = c.id
      LEFT JOIN posts p ON p.channel_id = c.id
      WHERE c.user_id = ${user.userId}
      GROUP BY c.id
      ORDER BY c.id
    `
    return NextResponse.json({ channels })
  } catch (error) {
    console.error('[channels] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const body = await request.json()

    const chatId = String(body.chatId ?? '').trim()
    if (!chatId || !(chatId.startsWith('@') || /^-?\d+$/.test(chatId))) {
      return NextResponse.json({ error: 'invalid_chat_id' }, { status: 400 })
    }
    const title = body.title ? String(body.title).slice(0, 120) : null
    const topic = String(body.topic ?? 'наука').slice(0, 120) || 'наука'
    const mode = String(body.mode ?? 'normal').slice(0, 20)
    const imagePolicy = IMAGE_POLICIES.includes(String(body.imagePolicy)) ? String(body.imagePolicy) : 'auto'

    const [channel] = await sql`
      INSERT INTO channels (user_id, chat_id, title, topic, mode, image_policy)
      VALUES (${user.userId}, ${chatId}, ${title}, ${topic}, ${mode}, ${imagePolicy})
      ON CONFLICT (user_id, chat_id) DO UPDATE
        SET title = COALESCE(EXCLUDED.title, channels.title), is_active = true
      RETURNING id, chat_id, title, topic, mode, image_policy, is_active
    `
    return NextResponse.json({ channel }, { status: 201 })
  } catch (error) {
    console.error('[channels] insert failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
