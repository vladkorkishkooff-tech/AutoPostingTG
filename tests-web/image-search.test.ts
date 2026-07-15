import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authMock, rateLimitMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  rateLimitMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getAuthUser: authMock,
  unauthorized: () => Response.json({ error: 'unauthorized' }, { status: 401 }),
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: rateLimitMock }))

import { POST as searchImages } from '@/app/api/image-search/route'

describe('shared stock image search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ userId: 7, telegramId: 111 })
    rateLimitMock.mockResolvedValue(null)
    process.env.BOT_BRIDGE_URL = 'https://bridge.example.test'
    process.env.BRIDGE_SECRET = 'test-bridge-secret'
  })

  it('returns three distinct candidates and expands exclusions for every bridge call', async () => {
    const calls: string[][] = []
    const results = [1, 2, 3].map((index) => ({
      url: `https://images.example.test/olympus-${index}.jpg`,
      source: 'NASA',
      title: `Olympus Mons ${index}`,
      query: 'Olympus Mons volcano Mars',
      requiredTerms: ['olympus', 'mons', 'volcano'],
    }))
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { excludedUrls: string[] }
      calls.push(body.excludedUrls)
      return Response.json(results[calls.length - 1])
    }))

    const response = await searchImages(new Request('https://example.test/api/image-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'Олимп на Марсе',
        text: 'Самый крупный вулкан — Olympus Mons.',
        count: 3,
        excludedUrls: ['https://images.example.test/already-seen.jpg'],
      }),
    }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.candidates).toHaveLength(3)
    expect(body.candidates[0].requiredTerms).toEqual(['olympus', 'mons', 'volcano'])
    expect(calls).toEqual([
      ['https://images.example.test/already-seen.jpg'],
      ['https://images.example.test/already-seen.jpg', results[0].url],
      ['https://images.example.test/already-seen.jpg', results[0].url, results[1].url],
    ])
    vi.unstubAllGlobals()
  })

  it('returns a retryable structured error when the bridge times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')))
    const response = await searchImages(new Request('https://example.test/api/image-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'космос', text: 'Точный текст поста' }),
    }))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: 'bot_unavailable', retryable: true })
    vi.unstubAllGlobals()
  })
})
