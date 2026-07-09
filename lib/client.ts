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

export const swrFetcher = (url: string) => apiFetch(url).then((r) => r.json())
