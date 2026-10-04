import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { validateContentPack } from '@/lib/content-pack'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const limited = await rateLimit(user.userId, 'content-import', 10)
    if (limited) return limited
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > 250_000) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
    const body = await request.json().catch(() => null)
    const channelId = Number(body?.channelId)
    const checked = validateContentPack(body?.pack)
    if (!Number.isSafeInteger(channelId) || channelId <= 0) return NextResponse.json({ error: 'bad_channel' }, { status: 400 })
    if (!checked.ok) return NextResponse.json({ error: 'invalid_content_pack', message: checked.error, field: checked.field }, { status: 400 })
    const [channel] = await sql`
      SELECT id FROM channels
      WHERE id = ${channelId} AND user_id = ${user.userId}
        AND is_active AND is_verified AND bot_can_post
        AND (chat_id ~ '^@[A-Za-z0-9_]{5,32}$' OR chat_id ~ '^-100[0-9]{6,}$')
    `
    if (!channel) return NextResponse.json({ error: 'channel_not_found' }, { status: 404 })
    const ids: number[] = []
    for (const post of checked.pack.posts) {
      const imageUrl = post.image?.url ?? null
      const imageSource = post.image?.source ?? (imageUrl ? 'external-agent' : null)
      const [row] = await sql`
        INSERT INTO posts (channel_id, topic, mode, text, text_hash, status, image_url, image_source, media_type, source_meta, scheduled_at)
        VALUES (${channelId}, ${post.topic}, ${post.mode}, ${post.text}, md5(${post.text}), 'queued', ${imageUrl}, ${imageSource}, ${imageUrl ? 'photo' : null}, ${JSON.stringify({ sourceMode: checked.pack.sourceMode, asOf: checked.pack.research.asOf, sources: checked.pack.research.sources, imagePrompt: post.image?.prompt ?? null })}::jsonb, ${post.scheduledAt ? new Date(post.scheduledAt) : null})
        RETURNING id
      `
      if (row?.id) ids.push(Number(row.id))
    }
    return NextResponse.json({ ok: true, count: ids.length, ids, research: checked.pack.research }, { status: 201 })
  } catch (error) {
    console.error('[content/import] failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
