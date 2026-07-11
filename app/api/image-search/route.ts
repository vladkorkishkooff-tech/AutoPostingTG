import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Подбор стокового фото по теме — проксирует запрос к боту (Pexels/Pixabay/Wikimedia). */
export async function POST(request: Request) {
  const bridgeUrl = process.env.BOT_BRIDGE_URL
  const bridgeSecret = process.env.BRIDGE_SECRET

  if (!bridgeUrl || !bridgeSecret) {
    return NextResponse.json({ error: 'bot_unavailable' }, { status: 503 })
  }

  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const body = await request.json()
    const res = await fetch(`${bridgeUrl.replace(/\/$/, '')}/image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret': bridgeSecret,
      },
      body: JSON.stringify({
        topic: String(body.topic ?? '').slice(0, 120),
        excludedUrls: Array.isArray(body.excludedUrls) ? body.excludedUrls.slice(0, 30) : [],
      }),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('[image-search] bridge call failed', error)
    return NextResponse.json({ error: 'bot_unavailable' }, { status: 503 })
  }
}
