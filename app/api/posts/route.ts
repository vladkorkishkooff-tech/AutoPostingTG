import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 100)

  try {
    const posts = status
      ? await sql`
          SELECT id, topic, mode, text, image_url, image_source, status, scheduled_at, published_at
          FROM posts WHERE status = ${status}
          ORDER BY coalesce(published_at, scheduled_at, created_at) DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, topic, mode, text, image_url, image_source, status, scheduled_at, published_at
          FROM posts
          ORDER BY coalesce(published_at, scheduled_at, created_at) DESC
          LIMIT ${limit}
        `
    return NextResponse.json({ posts })
  } catch (error) {
    console.error('[posts] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
