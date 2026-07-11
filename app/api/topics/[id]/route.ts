import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { id } = await params
    const topicId = Number(id)
    if (!Number.isFinite(topicId)) return NextResponse.json({ error: 'bad_id' }, { status: 400 })
    const body = await request.json()

    if (typeof body.isActive === 'boolean') {
      await sql`
        UPDATE topic_pool t SET is_active = ${body.isActive}
        FROM channels c
        WHERE t.id = ${topicId} AND t.channel_id = c.id AND c.user_id = ${user.userId}
      `
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[topics] PATCH failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { id } = await params
    const topicId = Number(id)
    if (!Number.isFinite(topicId)) return NextResponse.json({ error: 'bad_id' }, { status: 400 })
    await sql`
      DELETE FROM topic_pool t
      USING channels c
      WHERE t.id = ${topicId} AND t.channel_id = c.id AND c.user_id = ${user.userId}
    `
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[topics] DELETE failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
