import { createHmac, timingSafeEqual } from 'crypto'
import { sql } from '@/lib/db'

export type AuthUser = {
  userId: number
  telegramId: number
  username: string | null
  firstName: string | null
}

const MAX_INIT_DATA_AGE_SECONDS = 60 * 60 * 24 // 24 часа

/**
 * Валидация Telegram WebApp initData по официальному алгоритму:
 * secret_key = HMAC_SHA256("WebAppData", bot_token)
 * hash = HMAC_SHA256(data_check_string, secret_key)
 */
export function validateInitData(initData: string, botToken: string): Record<string, string> | null {
  if (!initData || !botToken) return null

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  const a = Buffer.from(computed, 'hex')
  const b = Buffer.from(hash, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const authDate = Number(params.get('auth_date') ?? 0)
  if (!authDate || Date.now() / 1000 - authDate > MAX_INIT_DATA_AGE_SECONDS) return null

  const result: Record<string, string> = {}
  for (const [k, v] of params.entries()) result[k] = v
  return result
}

/**
 * Достаёт пользователя из заголовка X-Telegram-Init-Data.
 * Создаёт пользователя в БД при первом входе.
 * Возвращает null, если авторизация не прошла.
 *
 * Режим разработки: если ALLOW_DEV_AUTH=1 и заголовка нет —
 * возвращает первого пользователя из БД (для локального превью).
 */
export async function getAuthUser(request: Request): Promise<AuthUser | null> {
  const initData = request.headers.get('x-telegram-init-data') ?? ''
  const botToken = process.env.BOT_TOKEN ?? ''

  if (initData && botToken) {
    const data = validateInitData(initData, botToken)
    if (!data) return null

    let tgUser: { id?: number; username?: string; first_name?: string }
    try {
      tgUser = JSON.parse(data.user ?? '{}')
    } catch {
      return null
    }
    if (!tgUser.id) return null

    const rows = (await sql`
      INSERT INTO users (telegram_id, username, first_name)
      VALUES (${tgUser.id}, ${tgUser.username ?? null}, ${tgUser.first_name ?? null})
      ON CONFLICT (telegram_id) DO UPDATE
        SET username = EXCLUDED.username,
            first_name = EXCLUDED.first_name,
            updated_at = now()
      RETURNING id, telegram_id, username, first_name
    `) as { id: number; telegram_id: number; username: string | null; first_name: string | null }[]

    const row = rows[0]
    if (!row) return null
    return {
      userId: row.id,
      telegramId: Number(row.telegram_id),
      username: row.username,
      firstName: row.first_name,
    }
  }

  // Dev-фоллбек: локальная разработка (NODE_ENV=development) или явный ALLOW_DEV_AUTH=1.
  // В production NODE_ENV=production, поэтому фоллбек недоступен без флага.
  if (process.env.NODE_ENV === 'development' || process.env.ALLOW_DEV_AUTH === '1') {
    const rows = (await sql`SELECT id, telegram_id, username, first_name FROM users ORDER BY id LIMIT 1`) as {
      id: number
      telegram_id: number
      username: string | null
      first_name: string | null
    }[]
    const row = rows[0]
    if (row) {
      return {
        userId: row.id,
        telegramId: Number(row.telegram_id),
        username: row.username,
        firstName: row.first_name,
      }
    }
    // Пустая база в dev-режиме: создаём владельца-заглушку
    const created = (await sql`
      INSERT INTO users (telegram_id, username, first_name)
      VALUES (0, 'dev', 'Dev User')
      ON CONFLICT (telegram_id) DO UPDATE SET updated_at = now()
      RETURNING id, telegram_id, username, first_name
    `) as { id: number; telegram_id: number; username: string | null; first_name: string | null }[]
    const dev = created[0]
    return dev
      ? { userId: dev.id, telegramId: 0, username: dev.username, firstName: dev.first_name }
      : null
  }

  return null
}

export function unauthorized() {
  return Response.json({ error: 'unauthorized' }, { status: 401 })
}
