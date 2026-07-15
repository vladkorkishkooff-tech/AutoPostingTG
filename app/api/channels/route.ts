import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { isValidChannelTarget, verifyChannelTarget } from './verification'

export const dynamic = 'force-dynamic'

const IMAGE_POLICIES = ['auto', 'off', 'ai']
const MODES = ['normal', 'short', 'long', 'funny', 'wow', 'strict']

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const channels = await sql`
      SELECT c.id, c.chat_id, c.title, c.topic, c.mode, c.image_policy, c.is_active,
             c.is_verified, c.telegram_chat_id, c.telegram_title, c.telegram_username,
             c.bot_can_post, c.verified_at, c.verification_error,
             count(DISTINCT s.id) FILTER (WHERE s.is_active) AS active_schedules,
             count(DISTINCT p.id) FILTER (WHERE p.status = 'published') AS published_posts
      FROM channels c
      LEFT JOIN schedules s ON s.channel_id = c.id
      LEFT JOIN posts p ON p.channel_id = c.id
      WHERE c.user_id = ${user.userId}
        AND (c.chat_id ~ '^@[A-Za-z0-9_]{5,32}$' OR c.chat_id ~ '^-100[0-9]{6,}$')
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
    if (!isValidChannelTarget(chatId)) {
      return NextResponse.json({ error: 'invalid_publication_target' }, { status: 400 })
    }
    const verification = await verifyChannelTarget(chatId)
    if (!verification.ok || !verification.chatId || !verification.canPost) {
      return NextResponse.json({ error: verification.error || 'verification_failed' }, { status: 422 })
    }
    const title = body.title ? String(body.title).slice(0, 120) : null
    const topic = String(body.topic ?? 'наука').slice(0, 120) || 'наука'
    const mode = String(body.mode ?? 'normal').slice(0, 20)
    if (!MODES.includes(mode)) return NextResponse.json({ error: 'invalid_mode' }, { status: 400 })
    const imagePolicy = IMAGE_POLICIES.includes(String(body.imagePolicy)) ? String(body.imagePolicy) : 'auto'

    const [channel] = await sql`
      INSERT INTO channels (
        user_id, chat_id, title, topic, mode, image_policy, is_active,
        is_verified, telegram_chat_id, telegram_title, telegram_username,
        bot_can_post, verified_at, verification_error, footer_title, footer_url
      )
      VALUES (
        ${user.userId}, ${chatId}, ${title || verification.title || null}, ${topic}, ${mode}, ${imagePolicy}, true,
        true, ${verification.chatId}, ${verification.title || null}, ${verification.username || null},
        true, now(), null, ${verification.title || title || null},
        ${verification.username ? `https://t.me/${verification.username}` : null}
      )
      ON CONFLICT (user_id, chat_id) DO UPDATE
        SET title = COALESCE(EXCLUDED.title, channels.title),
            topic = EXCLUDED.topic, mode = EXCLUDED.mode, image_policy = EXCLUDED.image_policy,
            is_active = true, is_verified = true,
            telegram_chat_id = EXCLUDED.telegram_chat_id,
            telegram_title = EXCLUDED.telegram_title,
            telegram_username = EXCLUDED.telegram_username,
            bot_can_post = true, verified_at = now(), verification_error = null,
            footer_title = COALESCE(channels.footer_title, EXCLUDED.footer_title),
            footer_url = COALESCE(channels.footer_url, EXCLUDED.footer_url), updated_at = now()
      RETURNING id, chat_id, title, topic, mode, image_policy, is_active,
                is_verified, telegram_chat_id, telegram_title, telegram_username,
                bot_can_post, verified_at, verification_error
    `
    return NextResponse.json({ channel }, { status: 201 })
  } catch (error) {
    console.error('[channels] insert failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
