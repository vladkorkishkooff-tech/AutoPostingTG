import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Подбор/генерация фото для поста из генератора.
 * action: "stock" — стоковое фото (Wikimedia/Openverse), "ai" — генерация Gemini.
 */
export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const bridgeUrl = process.env.BOT_BRIDGE_URL
  const bridgeSecret = process.env.BRIDGE_SECRET
  if (!bridgeUrl || !bridgeSecret) {
    return NextResponse.json({ error: 'bot_unavailable' }, { status: 503 })
  }

  let body: { action?: string; topic?: string; text?: string; excludedUrls?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const action = body.action === 'ai' ? 'ai' : 'stock'
  const endpoint = action === 'ai' ? '/ai_image' : '/image'

  try {
    const res = await fetch(`${bridgeUrl.replace(/\/$/, '')}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret': bridgeSecret,
      },
      body: JSON.stringify({
        topic: String(body.topic ?? '').slice(0, 120),
        text: String(body.text ?? '').slice(0, 2000),
        excludedUrls: Array.isArray(body.excludedUrls) ? body.excludedUrls.slice(0, 20) : [],
      }),
      signal: AbortSignal.timeout(55000),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('[generate-image] bridge call failed', error)
    return NextResponse.json({ error: 'bot_unavailable' }, { status: 503 })
  }
}
