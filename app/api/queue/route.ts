import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Очередь предпросмотра: посты, сгенерированные заранее и ожидающие публикации. */
export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const posts = await sql`
      SELECT p.id, p.channel_id, p.topic, p.mode, p.text, p.image_url, p.image_source,
             p.media_type, p.status, p.scheduled_at, p.created_at,
             c.title AS channel_title, c.chat_id
      FROM posts p
      JOIN channels c ON c.id = p.channel_id
      WHERE c.user_id = ${user.userId}
        AND p.status IN ('queued', 'approved')
        AND (p.scheduled_at IS NULL OR p.scheduled_at > now() - interval '1 hour')
      ORDER BY p.scheduled_at NULLS LAST, p.created_at DESC
      LIMIT 50
    `
    return NextResponse.json({ posts })
  } catch (error) {
    console.error('[queue] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
