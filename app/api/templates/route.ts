import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const templates = await sql`
      SELECT id, title, topic, mode, created_at
      FROM post_templates
      WHERE user_id = ${user.userId}
      ORDER BY created_at DESC
    `
    return NextResponse.json({ templates })
  } catch (error) {
    console.error('[templates] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const body = await request.json()
    const title = String(body.title ?? '').trim().slice(0, 60)
    const topic = String(body.topic ?? '').trim().slice(0, 120)
    if (!title || !topic) return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    const mode = typeof body.mode === 'string' && body.mode.trim() ? body.mode.slice(0, 30) : null

    const [template] = await sql`
      INSERT INTO post_templates (user_id, title, topic, mode)
      VALUES (${user.userId}, ${title}, ${topic}, ${mode})
      RETURNING id, title, topic, mode, created_at
    `
    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    console.error('[templates] insert failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })
    await sql`DELETE FROM post_templates WHERE id = ${id} AND user_id = ${user.userId}`
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[templates] delete failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
