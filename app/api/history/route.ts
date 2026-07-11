import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const history = await sql`
      SELECT id, topic, mode, text, created_at
      FROM generation_history
      WHERE user_id = ${user.userId}
      ORDER BY created_at DESC
      LIMIT 20
    `
    return NextResponse.json({ history })
  } catch (error) {
    console.error('[history] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const body = await request.json()
    const text = String(body.text ?? '').trim()
    if (!text) return NextResponse.json({ error: 'empty_text' }, { status: 400 })
    const topic = String(body.topic ?? '').trim().slice(0, 120) || 'без темы'
    const mode = typeof body.mode === 'string' ? body.mode.slice(0, 30) : null

    await sql`
      INSERT INTO generation_history (user_id, topic, mode, text)
      VALUES (${user.userId}, ${topic}, ${mode}, ${text.slice(0, 2000)})
    `
    // Храним только последние 50 записей на пользователя
    await sql`
      DELETE FROM generation_history
      WHERE user_id = ${user.userId}
        AND id NOT IN (
          SELECT id FROM generation_history
          WHERE user_id = ${user.userId}
          ORDER BY created_at DESC
          LIMIT 50
        )
    `
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    console.error('[history] insert failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
