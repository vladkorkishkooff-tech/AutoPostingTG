import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawStatus = searchParams.get('status')
  const allowedStatuses = new Set(['queued', 'approved', 'rejected', 'publishing', 'published', 'failed'])
  const status = rawStatus && allowedStatuses.has(rawStatus) ? rawStatus : null
  if (rawStatus && !status) return NextResponse.json({ error: 'invalid_status' }, { status: 400 })

  const requestedLimit = Number(searchParams.get('limit') ?? 50)
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    return NextResponse.json({ error: 'invalid_limit' }, { status: 400 })
  }
  const limit = Math.min(requestedLimit, 100)

  const requestedChannelId = searchParams.get('channelId')
  const channelId = requestedChannelId ? Number(requestedChannelId) : null
  if (channelId !== null && (!Number.isSafeInteger(channelId) || channelId <= 0)) {
    return NextResponse.json({ error: 'invalid_channel' }, { status: 400 })
  }

  const requestedDays = Number(searchParams.get('days') ?? 30)
  if (!Number.isSafeInteger(requestedDays) || requestedDays < 1 || requestedDays > 3650) {
    return NextResponse.json({ error: 'invalid_days' }, { status: 400 })
  }

  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const posts = await sql`
      SELECT p.id, p.channel_id, c.title AS channel_title, c.chat_id,
             p.topic, p.mode, p.text, p.image_url, p.image_source, p.status,
             p.scheduled_at, p.published_at, p.telegram_message_id
      FROM posts p
      JOIN channels c ON c.id = p.channel_id
      WHERE c.user_id = ${user.userId}
        AND (c.chat_id ~ '^@[A-Za-z0-9_]{5,32}$' OR c.chat_id ~ '^-100[0-9]{6,}$')
        AND (${status}::text IS NULL OR p.status = ${status})
        AND (${channelId}::bigint IS NULL OR p.channel_id = ${channelId})
        AND coalesce(p.published_at, p.scheduled_at, p.created_at) > now() - (${requestedDays}::int * interval '1 day')
      ORDER BY coalesce(p.published_at, p.scheduled_at, p.created_at) DESC
      LIMIT ${limit}
    `
    return NextResponse.json({ posts })
  } catch (error) {
    console.error('[posts] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
