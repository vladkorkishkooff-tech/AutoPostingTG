import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function errorResponse(code: string, message: string, status: number, retryable = false) {
  return NextResponse.json({ error: code, message, retryable }, { status })
}

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const limited = await rateLimit(user.userId, 'generate-image', 8)
  if (limited) return limited

  const bridgeUrl = process.env.BOT_BRIDGE_URL
  const bridgeSecret = process.env.BRIDGE_SECRET
  if (!bridgeUrl || !bridgeSecret) {
    return errorResponse('bot_unavailable', 'Бот не подключён к Mini App', 503, true)
  }

  let body: { action?: unknown; topic?: unknown; text?: unknown; excludedUrls?: unknown }
  try {
    body = await request.json()
  } catch {
    return errorResponse('invalid_json', 'Некорректный запрос', 400)
  }
  if (body.action !== 'ai' && body.action !== 'stock') {
    return errorResponse('invalid_action', 'Выберите AI или стоковое изображение', 400)
  }
  const topic = String(body.topic ?? '').trim().slice(0, 120)
  const text = String(body.text ?? '').trim().slice(0, 2000)
  if (!topic && !text) return errorResponse('empty_context', 'Сначала создайте текст поста', 400)
  const endpoint = body.action === 'ai' ? '/ai_image' : '/image'

  try {
    const res = await fetch(`${bridgeUrl.replace(/\/$/, '')}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Secret': bridgeSecret },
      body: JSON.stringify({
        topic: topic || 'наука',
        text,
        ownerTelegramId: user.telegramId,
        excludedUrls: Array.isArray(body.excludedUrls) ? body.excludedUrls.slice(0, 30) : [],
      }),
      signal: AbortSignal.timeout(55_000),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      const code = data.error || 'image_generation_failed'
      const messages: Record<string, string> = {
        no_key: 'Добавьте активный ключ Gemini в разделе API-ключей',
        image_not_found: 'Релевантное стоковое фото не найдено',
        generation_failed: 'Gemini не вернул изображение. Попробуйте ещё раз.',
      }
      return errorResponse(code, messages[code] || 'Не удалось подготовить изображение', res.status, res.status >= 500)
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error('[generate-image] bridge call failed', error)
    return errorResponse('bot_unavailable', 'Бот не ответил вовремя. Текущее фото сохранено.', 503, true)
  }
}
