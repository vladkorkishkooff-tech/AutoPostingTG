import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sqlMock, authMock, rateLimitMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  authMock: vi.fn(),
  rateLimitMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ sql: sqlMock }))
vi.mock('@/lib/auth', () => ({
  getAuthUser: authMock,
  unauthorized: () => Response.json({ error: 'unauthorized' }, { status: 401 }),
}))
vi.mock('@/lib/crypto', () => ({
  encryptSecret: () => 'encrypted',
  keyHint: () => '••••test',
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: rateLimitMock }))

import { POST as generatePost } from '@/app/api/generate/route'
import { POST as createKey } from '@/app/api/keys/route'
import { GET as getPosts } from '@/app/api/posts/route'
import { GET as getSchedules } from '@/app/api/schedules/route'
import { POST as createTemplate } from '@/app/api/templates/route'

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Mini App API validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ userId: 7, telegramId: 111 })
    rateLimitMock.mockResolvedValue(null)
  })

  it('rejects a custom provider pointing to a private address', async () => {
    const response = await createKey(jsonRequest('https://example.test/api/keys', {
      provider: 'custom',
      apiKey: 'valid-test-key',
      model: 'model',
      baseUrl: 'https://127.0.0.1/v1',
    }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'baseUrl must be a public HTTPS URL' })
    expect(sqlMock).not.toHaveBeenCalled()
  })

  it('requires a model for a custom provider', async () => {
    const response = await createKey(jsonRequest('https://example.test/api/keys', {
      provider: 'custom',
      apiKey: 'valid-test-key',
      baseUrl: 'https://api.example.com/v1',
    }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'model is required for custom provider' })
  })

  it('rejects invalid post limits before querying the database', async () => {
    const response = await getPosts(new Request('https://example.test/api/posts?limit=-1'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_limit' })
    expect(sqlMock).not.toHaveBeenCalled()
  })

  it('stores a safe default mode for templates', async () => {
    let insertedValues: unknown[] = []
    sqlMock.mockImplementationOnce((_strings: TemplateStringsArray, ...values: unknown[]) => {
      insertedValues = values
      return Promise.resolve([{ id: 1, title: 'Test', topic: 'Space', mode: 'normal' }])
    })
    const response = await createTemplate(jsonRequest('https://example.test/api/templates', {
      title: 'Test',
      topic: 'Space',
      mode: null,
    }))
    expect(response.status).toBe(201)
    expect(insertedValues).toContain('normal')
  })

  it('lists schedules only for verified publication channels', async () => {
    let query = ''
    sqlMock.mockImplementationOnce((strings: TemplateStringsArray) => {
      query = strings.join(' ')
      return Promise.resolve([])
    })
    const response = await getSchedules(new Request('https://example.test/api/schedules'))
    expect(response.status).toBe(200)
    expect(query).toContain('c.is_active AND c.is_verified AND c.bot_can_post')
    expect(query).toContain("c.chat_id ~ '^-100[0-9]{6,}$'")
  })

  it('never selects a personal Telegram ID for direct publication', async () => {
    process.env.BOT_BRIDGE_URL = 'https://bridge.example.test'
    process.env.BRIDGE_SECRET = 'test-bridge-secret'
    let query = ''
    sqlMock.mockImplementationOnce((strings: TemplateStringsArray) => {
      query = strings.join(' ')
      return Promise.resolve([])
    })
    const response = await generatePost(jsonRequest('https://example.test/api/generate', {
      action: 'publish',
      channelId: 9,
      topic: 'космос',
    }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('channel_not_found')
    expect(query).toContain("chat_id ~ '^-100[0-9]{6,}$'")
  })
})
