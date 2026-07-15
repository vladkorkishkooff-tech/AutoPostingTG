import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ sql: sqlMock }))

import { getAuthUser, validateInitData } from '@/lib/auth'

const BOT_TOKEN = '123456:test-token'

function signedInitData(telegramId: number, authDate = Math.floor(Date.now() / 1000)): string {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'test-query',
    user: JSON.stringify({ id: telegramId, username: 'tester', first_name: 'Test' }),
  })
  const dataCheckString = [...params.entries()].map(([key, value]) => `${key}=${value}`).sort().join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  params.set('hash', createHmac('sha256', secret).update(dataCheckString).digest('hex'))
  return params.toString()
}

describe('Telegram Mini App authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BOT_TOKEN = BOT_TOKEN
    process.env.ADMIN_USER_IDS = '111,333'
  })

  it('accepts a fresh correctly signed payload', () => {
    expect(validateInitData(signedInitData(111), BOT_TOKEN)?.user).toContain('111')
  })

  it('rejects an expired payload', () => {
    expect(validateInitData(signedInitData(111, 1), BOT_TOKEN)).toBeNull()
  })

  it('rejects a payload dated in the future', () => {
    expect(validateInitData(signedInitData(111, Math.floor(Date.now() / 1000) + 3600), BOT_TOKEN)).toBeNull()
  })

  it('rejects a valid Telegram user outside ADMIN_USER_IDS before touching the database', async () => {
    const result = await getAuthUser(new Request('https://example.test', {
      headers: { 'x-telegram-init-data': signedInitData(222) },
    }))
    expect(result).toBeNull()
    expect(sqlMock).not.toHaveBeenCalled()
  })

  it('creates or updates an authorised user', async () => {
    sqlMock.mockResolvedValueOnce([{ id: 7, telegram_id: 111, username: 'tester', first_name: 'Test' }])
    const result = await getAuthUser(new Request('https://example.test', {
      headers: { 'x-telegram-init-data': signedInitData(111) },
    }))
    expect(result).toEqual({ userId: 7, telegramId: 111, username: 'tester', firstName: 'Test' })
    expect(sqlMock).toHaveBeenCalledTimes(1)
  })
})
