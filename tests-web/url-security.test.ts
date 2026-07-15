import { describe, expect, it } from 'vitest'
import { normalisePublicHttpsBaseUrl } from '@/lib/url-security'

describe('normalisePublicHttpsBaseUrl', () => {
  it('normalises a public HTTPS API base URL', () => {
    expect(normalisePublicHttpsBaseUrl('https://API.Example.com/v1/')).toBe('https://api.example.com/v1')
  })

  it.each([
    'http://api.example.com/v1',
    'https://localhost/v1',
    'https://service.internal/v1',
    'https://127.0.0.1/v1',
    'https://10.1.2.3/v1',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/v1',
    'https://user:pass@example.com/v1',
    'https://api.example.com/v1?secret=value',
  ])('rejects unsafe URL %s', (value) => {
    expect(normalisePublicHttpsBaseUrl(value)).toBeNull()
  })
})
