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
  const bridgeUrl = process.env.BOT_BRIDGE_URL
  const bridgeSecret = process.env.BRIDGE_SECRET
  if (!bridgeUrl || !bridgeSecret) return { ok: false, error: 'bridge_unavailable' }

  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, '')}/verify_channel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret': bridgeSecret,
      },
      body: JSON.stringify({ chatId }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
    const data = (await response.json()) as ChannelVerification
    if (!response.ok || !data.ok) return { ok: false, error: data.error || 'verification_failed' }
    return data
  } catch {
    return { ok: false, error: 'bridge_unavailable' }
  }
}
