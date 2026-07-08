import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET() {
  try {
    const [totals] = await sql`
      SELECT
        count(*) FILTER (WHERE status = 'published') AS total_posts,
        count(*) FILTER (WHERE status = 'published' AND published_at::date = now()::date) AS posts_today,
        count(*) FILTER (WHERE status = 'scheduled') AS queued
      FROM posts
    `
    const [lastPost] = await sql`
      SELECT text, topic, image_url, published_at
      FROM posts
      WHERE status = 'published'
      ORDER BY published_at DESC
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
