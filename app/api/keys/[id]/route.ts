import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { id } = await params
    const keyId = Number(id)
    if (!Number.isSafeInteger(keyId) || keyId <= 0) return NextResponse.json({ error: 'bad_id' }, { status: 400 })
    const body = await request.json()

    if (typeof body.isActive === 'boolean') {
      const rows = await sql`UPDATE api_keys SET is_active = ${body.isActive}, updated_at = now() WHERE id = ${keyId} AND user_id = ${user.userId} RETURNING id`
      if (!rows.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (typeof body.priority === 'number' && Number.isSafeInteger(body.priority) && body.priority >= 0 && body.priority <= 1000) {
      const rows = await sql`UPDATE api_keys SET priority = ${body.priority}, updated_at = now() WHERE id = ${keyId} AND user_id = ${user.userId} RETURNING id`
      if (!rows.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (typeof body.model === 'string') {
      const model = body.model.trim().slice(0, 160)
      const rows = await sql`UPDATE api_keys SET model = ${model || null}, updated_at = now() WHERE id = ${keyId} AND user_id = ${user.userId} RETURNING id`
      if (!rows.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[v0] keys PATCH error:', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const { id } = await params
    const keyId = Number(id)
    if (!Number.isSafeInteger(keyId) || keyId <= 0) return NextResponse.json({ error: 'bad_id' }, { status: 400 })
    const rows = await sql`DELETE FROM api_keys WHERE id = ${keyId} AND user_id = ${user.userId} RETURNING id`
    if (!rows.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[v0] keys DELETE error:', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
