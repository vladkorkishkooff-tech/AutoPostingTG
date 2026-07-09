import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 100)

  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const posts = status
      ? await sql`
          SELECT p.id, p.topic, p.mode, p.text, p.image_url, p.image_source, p.status, p.scheduled_at, p.published_at
          FROM posts p JOIN channels c ON c.id = p.channel_id
          WHERE p.status = ${status} AND c.user_id = ${user.userId}
          ORDER BY coalesce(p.published_at, p.scheduled_at, p.created_at) DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT p.id, p.topic, p.mode, p.text, p.image_url, p.image_source, p.status, p.scheduled_at, p.published_at
          FROM posts p JOIN channels c ON c.id = p.channel_id
          WHERE c.user_id = ${user.userId}
          ORDER BY coalesce(p.published_at, p.scheduled_at, p.created_at) DESC
          LIMIT ${limit}
        `
    return NextResponse.json({ posts })
  } catch (error) {
    console.error('[posts] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
