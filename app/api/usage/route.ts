import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [totals, byProvider, daily, recentErrors] = await Promise.all([
      sql`
        SELECT
          count(*) FILTER (WHERE event_type = 'generation') AS generations,
          count(*) FILTER (WHERE event_type = 'generation' AND success) AS generations_ok,
          count(*) FILTER (WHERE event_type = 'publish' AND success) AS publishes,
          count(*) FILTER (WHERE event_type = 'publish' AND NOT success) AS publish_failures,
          coalesce(avg(duration_ms) FILTER (WHERE event_type = 'generation' AND success), 0)::int AS avg_duration_ms
        FROM usage_events
        WHERE created_at > now() - interval '30 days'
      `,
      sql`
        SELECT provider, model,
          count(*) AS attempts,
          count(*) FILTER (WHERE success) AS successes,
          coalesce(avg(duration_ms) FILTER (WHERE success), 0)::int AS avg_ms
        FROM usage_events
        WHERE event_type = 'generation' AND created_at > now() - interval '30 days' AND provider IS NOT NULL
        GROUP BY provider, model
        ORDER BY attempts DESC
        LIMIT 10
      `,
      sql`
        SELECT date_trunc('day', created_at)::date AS day,
          count(*) FILTER (WHERE event_type = 'publish' AND success) AS posts
        FROM usage_events
        WHERE created_at > now() - interval '14 days'
        GROUP BY 1
        ORDER BY 1
      `,
      sql`
        SELECT provider, model, error, created_at
        FROM usage_events
        WHERE NOT success AND created_at > now() - interval '7 days'
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
    console.error('[v0] usage stats error:', error)
    return NextResponse.json({ totals: null, byProvider: [], daily: [], recentErrors: [] })
  }
}
