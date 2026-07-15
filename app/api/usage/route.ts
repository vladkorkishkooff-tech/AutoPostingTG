import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const uid = user.userId
    const [totals, byProvider, daily, recentErrors] = await Promise.all([
      sql`
        WITH events AS (
          SELECT
            count(*) FILTER (WHERE event_type = 'generation') AS generations,
            count(*) FILTER (WHERE event_type = 'generation' AND success) AS generations_ok,
            coalesce(avg(duration_ms) FILTER (WHERE event_type = 'generation' AND success), 0)::int AS avg_duration_ms
          FROM usage_events WHERE created_at > now() - interval '30 days' AND user_id = ${uid}
        ), publication AS (
          SELECT
            count(*) FILTER (WHERE p.status = 'published') AS publishes,
            count(*) FILTER (WHERE p.status = 'failed') AS publish_failures
          FROM posts p JOIN channels c ON c.id = p.channel_id
          WHERE c.user_id = ${uid} AND p.created_at > now() - interval '30 days'
        )
        SELECT events.*, publication.publishes, publication.publish_failures FROM events, publication
      `,
      sql`
        SELECT provider, model,
          count(*) AS attempts,
          count(*) FILTER (WHERE success) AS successes,
          coalesce(avg(duration_ms) FILTER (WHERE success), 0)::int AS avg_ms
        FROM usage_events
        WHERE event_type = 'generation' AND created_at > now() - interval '30 days'
          AND provider IS NOT NULL AND user_id = ${uid}
        GROUP BY provider, model
        ORDER BY attempts DESC
        LIMIT 10
      `,
      sql`
        SELECT date_trunc('day', p.published_at)::date AS day, count(*) AS posts
        FROM posts p JOIN channels c ON c.id = p.channel_id
        WHERE p.status = 'published' AND p.published_at > now() - interval '14 days'
          AND c.user_id = ${uid}
        GROUP BY 1
        ORDER BY 1
      `,
      sql`
        SELECT provider, model, error, created_at
        FROM usage_events
        WHERE NOT success AND created_at > now() - interval '7 days' AND user_id = ${uid}
        ORDER BY created_at DESC
        LIMIT 5
      `,
    ])

    return NextResponse.json({
      totals: totals[0] ?? null,
      byProvider,
      daily,
      recentErrors,
    })
  } catch (error) {
    console.error('[usage] stats error:', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
