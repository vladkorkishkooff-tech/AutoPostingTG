import { describe, expect, it } from 'vitest'
import { validateContentPack } from '@/lib/content-pack'

const now = new Date().toISOString()
const validPack = {
  schemaVersion: 'autopostingtg.post-pack.v1',
  generatedAt: now,
  sourceMode: 'free-model',
  research: {
    topic: 'космос',
    asOf: now,
    sources: [{ title: 'NASA', url: 'https://science.nasa.gov/venus/venus-facts/', publishedAt: now }],
  },
  posts: [{ topic: 'космос', mode: 'wow', text: 'Это подтверждённый научный факт, который объясняет явление простыми словами и помогает увидеть привычную тему иначе.', image: { prompt: 'abstract planet, no text' } }],
}

describe('validateContentPack', () => {
  it('accepts a sourced agent pack', () => {
    const result = validateContentPack(validPack)
    expect(result.ok).toBe(true)
  })

  it('rejects packs without HTTPS provenance', () => {
    const result = validateContentPack({ ...validPack, research: { ...validPack.research, sources: [{ title: 'bad', url: 'http://example.com' }] } })
    expect(result.ok).toBe(false)
  })
})
