'use client'

/**
 * Единый fetch для Mini App: добавляет Telegram initData
 * в заголовок X-Telegram-Init-Data для авторизации на сервере.
 */
export function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const initData = (window as any).Telegram?.WebApp?.initData ?? ''
  return initData ? { 'X-Telegram-Init-Data': initData } : {}
}

export async function apiFetch(url: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  })
}

/**
 * Haptic feedback через Telegram WebApp API.
 * Вне Telegram — тихий no-op.
 */
export function haptic(style: 'light' | 'medium' | 'success' | 'error' = 'light') {
  if (typeof window === 'undefined') return
  const h = (window as any).Telegram?.WebApp?.HapticFeedback
  if (!h) return
  try {
    if (style === 'success' || style === 'error') h.notificationOccurred(style)
    else h.impactOccurred(style)
  } catch {
    // ignore
  }
}

export const swrFetcher = async (url: string) => {
  const res = await apiFetch(url)
  if (!res.ok) {
    const err = new Error(`API ${res.status}`)
    ;(err as any).status = res.status
    throw err
  }
  return res.json()
}
