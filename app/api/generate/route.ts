import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

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
    const res = await fetch(`${bridgeUrl.replace(/\/$/, '')}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret': bridgeSecret,
      },
      body: JSON.stringify({
        topic: String(body.topic ?? '').slice(0, 120),
        mode: String(body.mode ?? 'normal'),
        action:
          body.action === 'publish_custom'
            ? 'publish_custom'
            : body.action === 'publish'
              ? 'publish'
              : 'preview',
        ...(body.action === 'publish_custom'
          ? {
              text: String(body.text ?? '').slice(0, 2000),
              // Фото, выбранное в предпросмотре: URL стокового или data-URL AI-изображения
              ...(body.imageUrl ? { imageUrl: String(body.imageUrl).slice(0, 4_000_000) } : {}),
              ...(body.imageMode ? { imageMode: String(body.imageMode).slice(0, 10) } : {}),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('[generate] bridge call failed', error)
    return NextResponse.json({ error: 'bot_unavailable' }, { status: 503 })
  }
}
