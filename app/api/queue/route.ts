import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** Очередь предпросмотра: посты, сгенерированные заранее и ожидающие публикации. */
export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const posts = await sql`
      SELECT p.id, p.channel_id, p.topic, p.mode, p.text, p.image_url, p.image_source,
             p.media_type, p.status, p.scheduled_at, p.created_at, p.error, p.error_code,
             c.title AS channel_title, c.chat_id
      FROM posts p
      JOIN channels c ON c.id = p.channel_id
      WHERE c.user_id = ${user.userId}
        AND c.is_active AND c.is_verified AND c.bot_can_post
        AND (c.chat_id ~ '^@[A-Za-z0-9_]{5,32}$' OR c.chat_id ~ '^-100[0-9]{6,}$')
        AND p.status IN ('queued', 'approved', 'failed')
        AND (
          p.scheduled_at IS NULL
          OR p.scheduled_at > now() - interval '1 hour'
          OR (p.status = 'failed' AND p.created_at > now() - interval '7 days')
        )
      ORDER BY p.scheduled_at NULLS LAST, p.created_at DESC
      LIMIT 50
    `
    return NextResponse.json({ posts })
  } catch (error) {
    console.error('[queue] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

/** Add explicitly selected generator drafts to the manual review queue. */
export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const limited = await rateLimit(user.userId, 'queue-create', 10)
    if (limited) return limited

    let body: { channelId?: unknown; topic?: unknown; mode?: unknown; texts?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }
    const channelId = Number(body.channelId)
    const topic = String(body.topic ?? '').trim().slice(0, 120) || 'наука'
    const mode = String(body.mode ?? 'normal').trim().slice(0, 30) || 'normal'
    const texts = Array.isArray(body.texts)
      ? [...new Set(body.texts.map((value) => String(value ?? '').trim()).filter(Boolean))].slice(0, 5)
      : []
    if (!Number.isSafeInteger(channelId) || channelId <= 0 || texts.length === 0) {
      return NextResponse.json({ error: 'bad_input' }, { status: 400 })
    }
    if (texts.some((text) => text.length > 4000)) {
      return NextResponse.json({ error: 'text_too_long' }, { status: 400 })
    }
    const [channel] = await sql`
      SELECT id FROM channels
      WHERE id = ${channelId} AND user_id = ${user.userId}
        AND is_active AND is_verified AND bot_can_post
        AND (chat_id ~ '^@[A-Za-z0-9_]{5,32}$' OR chat_id ~ '^-100[0-9]{6,}$')
    `
    if (!channel) return NextResponse.json({ error: 'channel_not_found' }, { status: 404 })

    const ids: number[] = []
    for (const text of texts) {
      const [post] = await sql`
        INSERT INTO posts (channel_id, topic, mode, text, text_hash, status)
        VALUES (${channelId}, ${topic}, ${mode}, ${text}, md5(${text}), 'queued')
        RETURNING id
      `
      if (post?.id) ids.push(Number(post.id))
    }
    return NextResponse.json({ ok: true, ids, count: ids.length }, { status: 201 })
  } catch (error) {
    console.error('[queue] insert failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
