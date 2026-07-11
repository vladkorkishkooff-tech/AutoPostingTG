import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { id } = await params
    const scheduleId = Number(id)
    if (!Number.isFinite(scheduleId)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
    const body = await request.json()

    if (typeof body.isActive === 'boolean') {
      await sql`
        UPDATE schedules s SET is_active = ${body.isActive}
        FROM channels c
        WHERE s.id = ${scheduleId} AND s.channel_id = c.id AND c.user_id = ${user.userId}
      `
    }
    if (typeof body.postTime === 'string' && /^\d{2}:\d{2}$/.test(body.postTime)) {
      await sql`
        UPDATE schedules s SET post_time = ${body.postTime}
        FROM channels c
        WHERE s.id = ${scheduleId} AND s.channel_id = c.id AND c.user_id = ${user.userId}
      `
    }
    if ('topic' in body) {
      const topic = typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim().slice(0, 100) : null
      await sql`
        UPDATE schedules s SET topic = ${topic}
        FROM channels c
        WHERE s.id = ${scheduleId} AND s.channel_id = c.id AND c.user_id = ${user.userId}
      `
    }
    if ('mode' in body) {
      const mode = typeof body.mode === 'string' && body.mode.trim() ? body.mode.trim().slice(0, 30) : null
      await sql`
        UPDATE schedules s SET mode = ${mode}
        FROM channels c
        WHERE s.id = ${scheduleId} AND s.channel_id = c.id AND c.user_id = ${user.userId}
      `
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[v0] schedules PATCH error:', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { id } = await params
    const scheduleId = Number(id)
    if (!Number.isFinite(scheduleId)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
    await sql`
      DELETE FROM schedules s
      USING channels c
      WHERE s.id = ${scheduleId} AND s.channel_id = c.id AND c.user_id = ${user.userId}
    `
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[v0] schedules DELETE error:', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
