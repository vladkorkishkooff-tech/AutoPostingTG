import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const keyId = Number(id)
    if (!Number.isFinite(keyId)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
    const body = await request.json()

    if (typeof body.isActive === 'boolean') {
      await sql`UPDATE api_keys SET is_active = ${body.isActive} WHERE id = ${keyId}`
    }
    if (typeof body.priority === 'number') {
      await sql`UPDATE api_keys SET priority = ${body.priority} WHERE id = ${keyId}`
    }
    if (typeof body.model === 'string') {
      await sql`UPDATE api_keys SET model = ${body.model} WHERE id = ${keyId}`
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[v0] keys PATCH error:', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const keyId = Number(id)
    if (!Number.isFinite(keyId)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
    await sql`DELETE FROM api_keys WHERE id = ${keyId}`
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[v0] keys DELETE error:', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
