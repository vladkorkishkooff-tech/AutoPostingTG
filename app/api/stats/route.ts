import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const [totals] = await sql`
      SELECT
        count(*) FILTER (WHERE p.status = 'published') AS total_posts,
        count(*) FILTER (WHERE p.status = 'published' AND p.published_at::date = now()::date) AS posts_today,
        count(*) FILTER (WHERE p.status = 'scheduled') AS queued
      FROM posts p
      JOIN channels c ON c.id = p.channel_id
      WHERE c.user_id = ${user.userId}
    `
    const [lastPost] = await sql`
      SELECT p.text, p.topic, p.image_url, p.published_at
      FROM posts p
      JOIN channels c ON c.id = p.channel_id
      WHERE p.status = 'published' AND c.user_id = ${user.userId}
      ORDER BY p.published_at DESC
      LIMIT 1
    `
    return NextResponse.json({
      totalPosts: Number(totals?.total_posts ?? 0),
      postsToday: Number(totals?.posts_today ?? 0),
      queued: Number(totals?.queued ?? 0),
      lastPost: lastPost ?? null,
    })
  } catch (error) {
    console.error('[stats] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
