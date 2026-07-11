import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Аналитика: динамика подписчиков, активность постинга, разбивка по темам. */
export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()

    const [memberSeries, postActivity, topicBreakdown, statusCounts] = await Promise.all([
      sql`
        SELECT m.channel_id, c.title AS channel_title,
               date_trunc('day', m.captured_at) AS day,
               max(m.member_count) AS members
        FROM channel_metrics m
        JOIN channels c ON c.id = m.channel_id
        WHERE c.user_id = ${user.userId} AND m.captured_at > now() - interval '30 days'
        GROUP BY m.channel_id, c.title, day
        ORDER BY day
      `,
      sql`
        SELECT date_trunc('day', p.published_at) AS day, count(*)::int AS posts
        FROM posts p
        JOIN channels c ON c.id = p.channel_id
        WHERE c.user_id = ${user.userId} AND p.status = 'published'
          AND p.published_at > now() - interval '30 days'
        GROUP BY day
        ORDER BY day
      `,
      sql`
        SELECT p.topic, count(*)::int AS posts
        FROM posts p
        JOIN channels c ON c.id = p.channel_id
        WHERE c.user_id = ${user.userId} AND p.status = 'published'
        GROUP BY p.topic
        ORDER BY posts DESC
        LIMIT 8
      `,
      sql`
        SELECT p.status, count(*)::int AS count
        FROM posts p
        JOIN channels c ON c.id = p.channel_id
        WHERE c.user_id = ${user.userId}
        GROUP BY p.status
      `,
    ])

    return NextResponse.json({ memberSeries, postActivity, topicBreakdown, statusCounts })
  } catch (error) {
    console.error('[analytics] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
