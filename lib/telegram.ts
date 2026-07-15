'use client'

export type TelegramWebApp = {
  initData?: string
  ready?: () => void
  expand?: () => void
  isVersionAtLeast?: (version: string) => boolean
  HapticFeedback?: {
    notificationOccurred: (style: 'success' | 'error') => void
    impactOccurred: (style: 'light' | 'medium') => void
  }
}

export function getTelegramWebApp(): TelegramWebApp | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as typeof window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
}
