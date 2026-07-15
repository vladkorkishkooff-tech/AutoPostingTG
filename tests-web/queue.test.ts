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
vi.mock('@/lib/rate-limit', () => ({ rateLimit: rateLimitMock }))

import { POST as createQueueDrafts } from '@/app/api/queue/route'
import { PATCH as updateQueueDraft } from '@/app/api/queue/[id]/route'

function request(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('manual and batch queue workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ userId: 7, telegramId: 111 })
    rateLimitMock.mockResolvedValue(null)
    process.env.BOT_BRIDGE_URL = 'https://bridge.example.test'
    process.env.BRIDGE_SECRET = 'test-bridge-secret'
  })

  it('adds distinct selected batch drafts to an owned verified channel', async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: 9 }])
      .mockResolvedValueOnce([{ id: 101 }])
      .mockResolvedValueOnce([{ id: 102 }])
    const response = await createQueueDrafts(request('https://example.test/api/queue', {
      channelId: 9,
      topic: 'космос',
      mode: 'normal',
      texts: ['Первый факт', 'Первый факт', 'Второй факт'],
    }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ count: 2, ids: [101, 102] })
    const channelQuery = (sqlMock.mock.calls[0][0] as TemplateStringsArray).join(' ')
    expect(channelQuery).toContain("chat_id ~ '^-100[0-9]{6,}$'")
  })

  it('persists an individual stock image with every selected batch draft', async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: 9 }])
      .mockResolvedValueOnce([{ id: 201 }])
      .mockResolvedValueOnce([{ id: 202 }])
    const response = await createQueueDrafts(request('https://example.test/api/queue', {
      channelId: 9,
      topic: 'космос',
      mode: 'wow',
      items: [
        {
          text: 'Факт об Олимпе на Марсе',
          imageUrl: 'https://images.example.test/olympus.jpg',
          imageSource: 'NASA',
          mediaType: 'photo',
        },
        {
          text: 'Факт о Титане',
          imageUrl: 'https://images.example.test/titan.jpg',
          imageSource: 'Pexels',
          mediaType: 'photo',
        },
      ],
    }))

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ count: 2, ids: [201, 202] })
    const firstInsert = (sqlMock.mock.calls[1][0] as TemplateStringsArray).join(' ')
    expect(firstInsert).toContain('image_url, image_source, media_type')
    expect(sqlMock.mock.calls[1].slice(1)).toEqual([
      9,
      'космос',
      'wow',
      'Факт об Олимпе на Марсе',
      'Факт об Олимпе на Марсе',
      'https://images.example.test/olympus.jpg',
      'NASA',
      'photo',
    ])
    expect(sqlMock.mock.calls[2].slice(-3)).toEqual([
      'https://images.example.test/titan.jpg',
      'Pexels',
      'photo',
    ])
  })

  it('rejects unsafe image URLs before inserting a batch', async () => {
    const response = await createQueueDrafts(request('https://example.test/api/queue', {
      channelId: 9,
      items: [{ text: 'Факт', imageUrl: 'file:///etc/passwd', imageSource: 'custom' }],
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_image_url' })
    expect(sqlMock).not.toHaveBeenCalled()
  })

  it('keeps the old queued text when regeneration fails', async () => {
    sqlMock.mockResolvedValueOnce([{
      id: 101,
      status: 'queued',
      channel_id: 9,
      topic: 'космос',
      mode: 'normal',
      text: 'Старый факт',
      image_url: null,
      media_type: null,
      scheduled_at: null,
      target_chat: '-100123456',
    }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      Response.json({ error: 'generation_failed' }, { status: 502 }),
    ))
    const response = await updateQueueDraft(
      request('https://example.test/api/queue/101', { action: 'regenerate' }, 'PATCH'),
      { params: Promise.resolve({ id: '101' }) },
    )
    expect(response.status).toBe(502)
    expect(sqlMock).toHaveBeenCalledTimes(1)
    const ownershipQuery = (sqlMock.mock.calls[0][0] as TemplateStringsArray).join(' ')
    expect(ownershipQuery).toContain('c.is_verified')
    expect(ownershipQuery).toContain('c.bot_can_post')
    expect(ownershipQuery).toContain('c.chat_id AS target_chat')
    expect(ownershipQuery).not.toContain('coalesce(c.telegram_chat_id')
    vi.unstubAllGlobals()
  })
})
