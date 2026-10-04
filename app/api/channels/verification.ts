import { getBridgeUrl } from '@/lib/bridge-url'

export type ChannelVerification = {
  ok: boolean
  chatId?: number
  title?: string | null
  username?: string | null
  canPost?: boolean
  error?: string
}

export function isValidChannelTarget(value: string): boolean {
  return /^@[A-Za-z0-9_]{5,32}$/.test(value) || /^-100\d{6,}$/.test(value)
}

export async function verifyChannelTarget(chatId: string): Promise<ChannelVerification> {
  if (!isValidChannelTarget(chatId)) {
    return { ok: false, error: 'invalid_publication_target' }
  }
  const bridgeUrl = getBridgeUrl()
  const bridgeSecret = process.env.BRIDGE_SECRET
  if (!bridgeUrl || !bridgeSecret) return { ok: false, error: 'bridge_unavailable' }

  try {
    const response = await fetch(`${bridgeUrl}/verify_channel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret': bridgeSecret,
      },
      body: JSON.stringify({ chatId }),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    return {
      ok: response.ok && data.ok === true,
      chatId: typeof data.chatId === 'number' ? data.chatId : undefined,
      title: typeof data.title === 'string' ? data.title : null,
      username: typeof data.username === 'string' ? data.username : null,
      canPost: Boolean(data.canPost),
      error: typeof data.error === 'string' ? data.error : undefined,
    }
  } catch {
    return { ok: false, error: 'bridge_unreachable' }
  }
}
