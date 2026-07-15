import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/** Atomic, database-backed fixed-window limit that also works across Vercel instances. */
export async function rateLimit(
  userId: number,
  bucket: string,
  requestsPerMinute: number,
): Promise<NextResponse | null> {
  const safeBucket = bucket.slice(0, 50)
  const limit = Math.max(1, Math.min(requestsPerMinute, 120))
  const rows = await sql`
    INSERT INTO api_rate_limits (user_id, bucket, window_started_at, request_count)
    VALUES (${userId}, ${safeBucket}, date_trunc('minute', now()), 1)
    ON CONFLICT (user_id, bucket, window_started_at)
    DO UPDATE SET request_count = api_rate_limits.request_count + 1
      WHERE api_rate_limits.request_count < ${limit}
    RETURNING request_count
  `
  if (rows[0]) return null
  return NextResponse.json(
    {
      error: 'rate_limited',
      details: {
        code: 'rate_limited',
        message: 'Слишком много запросов. Подождите до следующей минуты.',
        retryable: true,
      },
    },
    { status: 429, headers: { 'Retry-After': '60' } },
  )
}
