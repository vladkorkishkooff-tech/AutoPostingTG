import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type ImageCandidate = {
  url: string
  source: string
  title?: string
  query?: string
  requiredTerms?: string[]
}

function errorResponse(code: string, message: string, status: number, retryable = false) {
  return NextResponse.json({ error: code, message, retryable }, { status })
}

/** Return one or more distinct stock candidates while preserving exclusions. */
export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const limited = await rateLimit(user.userId, 'image-search', 15)
  if (limited) return limited

  const bridgeUrl = process.env.BOT_BRIDGE_URL
  const bridgeSecret = process.env.BRIDGE_SECRET
  if (!bridgeUrl || !bridgeSecret) {
    return errorResponse('bot_unavailable', 'Бот не подключён к Mini App', 503, true)
  }

  let body: { topic?: unknown; text?: unknown; excludedUrls?: unknown; count?: unknown }
  try {
    body = await request.json()
  } catch {
    return errorResponse('invalid_json', 'Некорректный запрос', 400)
  }

  const topic = String(body.topic ?? '').trim().slice(0, 120)
  const postText = String(body.text ?? '').trim().slice(0, 2000)
  if (!topic && !postText) return errorResponse('empty_context', 'Укажите тему или текст поста', 400)

  const count = Math.max(1, Math.min(Number(body.count) || 1, 3))
  const excluded = new Set(
    Array.isArray(body.excludedUrls)
      ? body.excludedUrls.filter((url): url is string => typeof url === 'string' && /^https?:\/\//.test(url)).slice(0, 30)
      : [],
  )
  const candidates: ImageCandidate[] = []

  try {
    for (let index = 0; index < count; index += 1) {
      const res = await fetch(`${bridgeUrl.replace(/\/$/, '')}/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Bridge-Secret': bridgeSecret },
        body: JSON.stringify({
          topic: topic || 'наука',
          text: postText,
          excludedUrls: [...excluded],
          ownerTelegramId: user.telegramId,
        }),
        signal: AbortSignal.timeout(25_000),
      })
      const data = (await res.json().catch(() => ({}))) as Partial<ImageCandidate> & { error?: string }
      if (!res.ok) {
        if (res.status === 404) break
        return errorResponse(
          data.error || 'provider_error',
          res.status === 422 ? 'Провайдер отклонил запрос' : 'Не удалось получить фото от бота',
          res.status >= 500 ? 502 : res.status,
          res.status >= 500 || res.status === 429,
        )
      }
      if (!data.url || excluded.has(data.url)) break
      const candidate = {
        url: data.url,
        source: data.source || 'stock',
        title: data.title,
        query: data.query,
        requiredTerms: Array.isArray(data.requiredTerms)
          ? data.requiredTerms.filter((term): term is string => typeof term === 'string').slice(0, 8)
          : undefined,
      }
      candidates.push(candidate)
      excluded.add(data.url)
    }
  } catch (error) {
    console.error('[image-search] bridge call failed', error)
    return errorResponse('bot_unavailable', 'Бот не ответил вовремя. Старое фото сохранено.', 503, true)
  }

  if (candidates.length === 0) {
    return errorResponse(
      'image_not_found',
      'Релевантное фото не найдено. Измените формулировку темы или попробуйте ещё раз.',
      404,
    )
  }
  return NextResponse.json({ ...candidates[0], candidates })
}
