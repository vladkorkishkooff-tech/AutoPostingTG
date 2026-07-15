import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Управление постом в очереди:
 * - action: 'approve' | 'reject' — одобрить или отклонить
 * - text — отредактировать текст перед публикацией
 * - imageUrl / mediaType — заменить медиа ('photo' | 'video'), null = убрать
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { id } = await params
    const postId = Number(id)
    if (!Number.isFinite(postId)) return NextResponse.json({ error: 'bad_id' }, { status: 400 })
    const body = await request.json()

    // Проверяем владение постом через канал
    const [post] = await sql`
      SELECT p.id, p.status, p.channel_id, p.topic, p.mode, p.text,
             p.image_url, p.media_type, p.scheduled_at,
             coalesce(c.telegram_chat_id::text, c.chat_id) AS target_chat
      FROM posts p
      JOIN channels c ON c.id = p.channel_id
      WHERE p.id = ${postId} AND c.user_id = ${user.userId}
        AND c.is_active AND c.is_verified AND c.bot_can_post
        AND (c.chat_id ~ '^@[A-Za-z0-9_]{5,32}$' OR c.chat_id ~ '^-100[0-9]{6,}$')
    `
    if (!post) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (!['queued', 'approved', 'failed'].includes(String(post.status))) {
      return NextResponse.json({ error: 'not_editable' }, { status: 409 })
    }
    if (post.status === 'failed' && ['approve', 'reject'].includes(String(body.action))) {
      return NextResponse.json({ error: 'failed_post_retry_only' }, { status: 409 })
    }

    if (body.action === 'regenerate') {
      const limited = await rateLimit(user.userId, 'queue-regenerate', 8)
      if (limited) return limited
      const bridgeUrl = process.env.BOT_BRIDGE_URL
      const bridgeSecret = process.env.BRIDGE_SECRET
      if (!bridgeUrl || !bridgeSecret) {
        return NextResponse.json({ error: 'bot_unavailable' }, { status: 503 })
      }
      const response = await fetch(`${bridgeUrl.replace(/\/$/, '')}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Bridge-Secret': bridgeSecret },
        body: JSON.stringify({
          action: 'preview',
          topic: post.topic,
          mode: post.mode,
          targetChat: post.target_chat,
          ownerTelegramId: user.telegramId,
          avoidText: `Создай другой факт, не перефразируй этот черновик:\n${post.text}`.slice(0, 2000),
        }),
        signal: AbortSignal.timeout(45_000),
        cache: 'no-store',
      })
      const result = (await response.json().catch(() => ({}))) as { text?: unknown; error?: string }
      const nextText = typeof result.text === 'string' ? result.text.trim().slice(0, 4000) : ''
      if (!response.ok || !nextText || nextText === post.text) {
        return NextResponse.json(
          { error: result.error || 'regeneration_failed', retryable: response.status >= 500 },
          { status: response.ok ? 502 : response.status },
        )
      }
      await sql`
        UPDATE posts SET text = ${nextText}, text_hash = md5(${nextText}),
          image_url = null, image_source = null, media_type = null
        WHERE id = ${postId}
      `
      return NextResponse.json({ ok: true, text: nextText, photoStale: true })
    }

    if (body.action === 'publish') {
      if (post.scheduled_at && post.status !== 'failed') {
        return NextResponse.json({ error: 'scheduled_post_requires_approval' }, { status: 409 })
      }
      const limited = await rateLimit(user.userId, 'queue-publish', 6)
      if (limited) return limited
      const bridgeUrl = process.env.BOT_BRIDGE_URL
      const bridgeSecret = process.env.BRIDGE_SECRET
      if (!bridgeUrl || !bridgeSecret) {
        return NextResponse.json({ error: 'bot_unavailable' }, { status: 503 })
      }
      const response = await fetch(`${bridgeUrl.replace(/\/$/, '')}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Bridge-Secret': bridgeSecret },
        body: JSON.stringify({
          action: 'publish_custom',
          topic: post.topic,
          mode: post.mode,
          targetChat: post.target_chat,
          ownerTelegramId: user.telegramId,
          text: post.text,
          ...(post.image_url ? { imageUrl: post.image_url, imageMode: post.media_type || 'photo' } : {}),
        }),
        signal: AbortSignal.timeout(60_000),
        cache: 'no-store',
      })
      const result = (await response.json().catch(() => ({}))) as Record<string, unknown>
      if (!response.ok || result.ok !== true) {
        return NextResponse.json(
          { error: String(result.error || 'publish_failed'), retryable: response.status >= 500 },
          { status: response.ok ? 502 : response.status },
        )
      }
      // main.py persists the confirmed Telegram publication as the canonical
      // post row. Remove only this unscheduled draft after confirmation.
      if (post.status === 'failed') {
        await sql`
          UPDATE posts SET status = 'rejected', error = 'retried_manually', error_code = null
          WHERE id = ${postId} AND status = 'failed'
        `
      } else {
        await sql`DELETE FROM posts WHERE id = ${postId} AND scheduled_at IS NULL`
      }
      return NextResponse.json(result)
    }

    if (typeof body.text === 'string' && body.text.trim()) {
      const text = body.text.trim().slice(0, 4000)
      await sql`UPDATE posts SET text = ${text}, text_hash = md5(${text}) WHERE id = ${postId}`
    }

    if ('imageUrl' in body) {
      const imageUrl = typeof body.imageUrl === 'string' && body.imageUrl.trim() ? body.imageUrl.trim() : null
      const mediaType = imageUrl
        ? body.mediaType === 'video'
          ? 'video'
          : 'photo'
        : null
      const imageSource = imageUrl ? (typeof body.imageSource === 'string' ? body.imageSource : 'custom') : null
      await sql`
        UPDATE posts
        SET image_url = ${imageUrl}, media_type = ${mediaType}, image_source = ${imageSource}
        WHERE id = ${postId}
      `
    }

    if (body.action === 'approve') {
      await sql`UPDATE posts SET status = 'approved' WHERE id = ${postId}`
    } else if (body.action === 'reject') {
      await sql`UPDATE posts SET status = 'rejected' WHERE id = ${postId}`
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[queue] patch failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { id } = await params
    const postId = Number(id)
    if (!Number.isFinite(postId)) return NextResponse.json({ error: 'bad_id' }, { status: 400 })
    await sql`
      UPDATE posts p SET status = 'rejected'
      FROM channels c
      WHERE p.id = ${postId} AND p.channel_id = c.id AND c.user_id = ${user.userId}
        AND p.status IN ('queued', 'approved')
    `
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[queue] delete failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
