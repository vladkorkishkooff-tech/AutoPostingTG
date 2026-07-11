import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

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
      SELECT p.id, p.status FROM posts p
      JOIN channels c ON c.id = p.channel_id
      WHERE p.id = ${postId} AND c.user_id = ${user.userId}
    `
    if (!post) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (post.status !== 'queued' && post.status !== 'approved') {
      return NextResponse.json({ error: 'not_editable' }, { status: 409 })
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
