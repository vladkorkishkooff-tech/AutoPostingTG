import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { sql } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type GenerateBody = {
  topic?: unknown
  mode?: unknown
  channelId?: unknown
  action?: unknown
  text?: unknown
  imageUrl?: unknown
  imageMode?: unknown
  avoidText?: unknown
  avoidTexts?: unknown
  count?: unknown
}

type BridgeResult = {
  ok: boolean
  status: number
  data: Record<string, unknown>
}

function apiError(code: string, message: string, status: number, retryable = false, extra = {}) {
  // `error` remains a string for existing Mini App clients. New clients can
  // use the structured `details` object.
  return NextResponse.json(
    { error: code, details: { code, message, retryable }, ...extra },
    { status },
  )
}

function normalizedText(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/[^0-9a-zа-яё]+/gi, ' ')
    .trim()
}

function isDistinct(candidate: string, previous: string[]): boolean {
  const normalized = normalizedText(candidate)
  if (!normalized) return false
  const words = new Set(normalized.split(/\s+/))
  return previous.every((item) => {
    const old = normalizedText(item)
    if (!old || old === normalized) return old !== normalized
    const oldWords = new Set(old.split(/\s+/))
    const union = new Set([...words, ...oldWords])
    const shared = [...words].filter((word) => oldWords.has(word)).length
    return union.size === 0 || shared / union.size < 0.72
  })
}

function compactAvoidTexts(values: unknown[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const text = String(value ?? '').trim().slice(0, 700)
    const key = normalizedText(text)
    if (!text || !key || seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length === 12) break
  }
  return result
}

function avoidPrompt(texts: string[], variant: number): string {
  const header = `Вариант ${variant}: выбери другой конкретный факт по теме, не перефразируй прежний.`
  return [header, ...texts.map((text) => `---\n${text}`)].join('\n').slice(0, 2000)
}

async function callBridge(
  bridgeUrl: string,
  bridgeSecret: string,
  payload: Record<string, unknown>,
): Promise<BridgeResult> {
  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, '')}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret': bridgeSecret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
      cache: 'no-store',
    })
    let data: Record<string, unknown> = {}
    try {
      data = (await response.json()) as Record<string, unknown>
    } catch {
      data = { error: 'invalid_bridge_response' }
    }
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return {
      ok: false,
      status: timeout ? 504 : 503,
      data: { error: timeout ? 'generation_timeout' : 'bot_unavailable' },
    }
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const limited = await rateLimit(user.userId, 'generate', 12)
    if (limited) return limited

    let body: GenerateBody
    try {
      body = (await request.json()) as GenerateBody
    } catch {
      return apiError('invalid_json', 'Тело запроса должно быть JSON.', 400)
    }

    const bridgeUrl = process.env.BOT_BRIDGE_URL
    const bridgeSecret = process.env.BRIDGE_SECRET
    if (!bridgeUrl || !bridgeSecret) {
      return apiError('bot_unavailable', 'Связь с ботом не настроена.', 503, true)
    }

    const action = String(body.action ?? 'preview')
    if (!['preview', 'publish', 'publish_custom'].includes(action)) {
      return apiError('invalid_action', 'Неизвестное действие генератора.', 400)
    }

    const rawCount = body.count === undefined ? 1 : Number(body.count)
    if (!Number.isInteger(rawCount) || rawCount < 1 || rawCount > 5) {
      return apiError('invalid_count', 'Число постов должно быть от 1 до 5.', 400)
    }
    if (rawCount > 1 && action !== 'preview') {
      return apiError(
        'batch_preview_only',
        'Пакетная генерация создаёт только черновики и никогда не публикует их автоматически.',
        400,
      )
    }

    // Keep the legacy API behaviour: an omitted topic means the generic
    // science topic. The Mini App itself always sends an explicit value.
    const topic = String(body.topic ?? '').trim().slice(0, 120) || 'наука'

    const requestedChannelId = Number(body.channelId)
    const channels =
      Number.isInteger(requestedChannelId) && requestedChannelId > 0
        ? await sql`
            SELECT chat_id FROM channels
            WHERE id = ${requestedChannelId} AND user_id = ${user.userId}
              AND is_active AND is_verified AND bot_can_post
              AND (chat_id ~ '^@[A-Za-z0-9_]{5,32}$' OR chat_id ~ '^-100[0-9]{6,}$')
            LIMIT 1
          `
        : await sql`
            SELECT chat_id FROM channels
            WHERE user_id = ${user.userId} AND is_active AND is_verified AND bot_can_post
              AND (chat_id ~ '^@[A-Za-z0-9_]{5,32}$' OR chat_id ~ '^-100[0-9]{6,}$')
            ORDER BY id LIMIT 1
          `
    const targetChat = channels[0]?.chat_id ? String(channels[0].chat_id) : null
    if ((action === 'publish' || action === 'publish_custom') && !targetChat) {
      return apiError('channel_not_found', 'Нет активного проверенного канала.', 400)
    }

    const basePayload: Record<string, unknown> = {
      topic,
      mode: String(body.mode ?? 'normal').slice(0, 30),
      ownerTelegramId: user.telegramId,
      ...(targetChat ? { targetChat } : {}),
    }

    if (action !== 'preview') {
      const customText = String(body.text ?? '').trim().slice(0, 2000)
      if (action === 'publish_custom' && !customText) {
        return apiError('empty_text', 'Нельзя опубликовать пустой текст.', 400)
      }
      const result = await callBridge(bridgeUrl, bridgeSecret, {
        ...basePayload,
        action,
        ...(action === 'publish_custom'
          ? {
              text: customText,
              ...(body.imageUrl ? { imageUrl: String(body.imageUrl).slice(0, 4_000_000) } : {}),
              ...(body.imageMode ? { imageMode: String(body.imageMode).slice(0, 10) } : {}),
            }
          : {}),
      })
      if (!result.ok) {
        const code = String(result.data.error ?? 'publish_failed')
        return apiError(code, 'Бот не смог опубликовать пост.', result.status, result.status >= 500)
      }
      return NextResponse.json(result.data)
    }

    const suppliedAvoid = [
      body.avoidText,
      ...(Array.isArray(body.avoidTexts) ? body.avoidTexts : []),
    ]
    const recentRows = await sql`
      SELECT text FROM generation_history
      WHERE user_id = ${user.userId}
      ORDER BY created_at DESC
      LIMIT 8
    `
    const avoidTexts = compactAvoidTexts([...suppliedAvoid, ...recentRows.map((row) => row.text)])
    const posts: string[] = []
    // At most one replacement attempt for a batch, keeping the worst-case
    // duration below this route's 300-second production limit.
    const attemptLimit = rawCount === 1 ? 2 : rawCount + 1
    let lastFailure: BridgeResult | null = null

    for (let attempt = 0; attempt < attemptLimit && posts.length < rawCount; attempt += 1) {
      const result = await callBridge(bridgeUrl, bridgeSecret, {
        ...basePayload,
        action: 'preview',
        avoidText: avoidPrompt([...posts, ...avoidTexts], posts.length + 1),
      })
      if (!result.ok) {
        lastFailure = result
        continue
      }
      const text = String(result.data.text ?? '').trim()
      if (!text || !isDistinct(text, [...posts, ...avoidTexts])) continue
      posts.push(text)
    }

    if (posts.length !== rawCount) {
      const upstreamCode = lastFailure ? String(lastFailure.data.error ?? '') : ''
      const code = upstreamCode || (posts.length ? 'generation_incomplete' : 'generation_failed')
      return apiError(
        code,
        posts.length
          ? `Создано ${posts.length} из ${rawCount} различающихся черновиков.`
          : 'Не удалось создать новый черновик.',
        lastFailure?.status && lastFailure.status >= 500 ? lastFailure.status : 502,
        true,
        { partialPosts: posts, requestedCount: rawCount },
      )
    }

    // Preserve the original single-preview contract for existing clients.
    return rawCount === 1
      ? NextResponse.json({ text: posts[0] })
      : NextResponse.json({ posts, count: posts.length })
  } catch (error) {
    console.error('[generate] request failed', error)
    return apiError('internal_error', 'Внутренняя ошибка генератора.', 500, true)
  }
}
