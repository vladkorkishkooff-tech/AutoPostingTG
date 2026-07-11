import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const IMAGE_POLICIES = ['auto', 'off', 'ai']

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { id } = await params
    const channelId = Number(id)
    if (!Number.isFinite(channelId)) return NextResponse.json({ error: 'bad_id' }, { status: 400 })
    const body = await request.json()

    if (typeof body.isActive === 'boolean') {
      await sql`
        UPDATE channels SET is_active = ${body.isActive}
        WHERE id = ${channelId} AND user_id = ${user.userId}
      `
    }
    if (typeof body.topic === 'string' && body.topic.trim()) {
      await sql`
        UPDATE channels SET topic = ${body.topic.trim().slice(0, 120)}
        WHERE id = ${channelId} AND user_id = ${user.userId}
      `
    }
    if (typeof body.mode === 'string' && body.mode.trim()) {
      await sql`
        UPDATE channels SET mode = ${body.mode.trim().slice(0, 20)}
        WHERE id = ${channelId} AND user_id = ${user.userId}
      `
    }
    if (typeof body.title === 'string') {
      await sql`
        UPDATE channels SET title = ${body.title.trim().slice(0, 120) || null}
        WHERE id = ${channelId} AND user_id = ${user.userId}
      `
    }
    if (typeof body.imagePolicy === 'string' && IMAGE_POLICIES.includes(body.imagePolicy)) {
      await sql`
        UPDATE channels SET image_policy = ${body.imagePolicy}
        WHERE id = ${channelId} AND user_id = ${user.userId}
      `
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[channels] PATCH failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { id } = await params
    const channelId = Number(id)
    if (!Number.isFinite(channelId)) return NextResponse.json({ error: 'bad_id' }, { status: 400 })

    // Мягкое отключение: посты и история остаются в БД
    await sql`
      UPDATE channels SET is_active = false
      WHERE id = ${channelId} AND user_id = ${user.userId}
    `
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[channels] DELETE failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
