import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ sql: sqlMock }))

import { rateLimit } from '@/lib/rate-limit'

describe('database rate limiter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows a request when the atomic counter returns a row', async () => {
    sqlMock.mockResolvedValue([{ request_count: 2 }])
    expect(await rateLimit(7, 'generate', 12)).toBeNull()
  })

  it('returns 429 and Retry-After when the window is exhausted', async () => {
    sqlMock.mockResolvedValue([])
    const response = await rateLimit(7, 'generate', 12)
    expect(response?.status).toBe(429)
    expect(response?.headers.get('Retry-After')).toBe('60')
    expect(await response?.json()).toMatchObject({ error: 'rate_limited' })
  })
})
