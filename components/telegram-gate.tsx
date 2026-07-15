'use client'

import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { getTelegramWebApp } from '@/lib/telegram'

export function TelegramGate({ children }: { children: React.ReactNode }) {
  const [telegramReady, setTelegramReady] = useState<boolean | null>(null)

  useEffect(() => {
    const webApp = getTelegramWebApp()

    try {
      webApp?.ready?.()
      webApp?.expand?.()
    } catch {
      // Telegram API may be unavailable in an ordinary browser.
    }

    const ready = process.env.NODE_ENV === 'development' || Boolean(webApp?.initData)
    queueMicrotask(() => setTelegramReady(ready))
  }, [])

  if (telegramReady === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-label="Загрузка Mini App">
        <span className="size-7 animate-pulse rounded-full bg-primary/70" />
      </div>
    )
  }

  if (!telegramReady) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 py-12">
        <section className="glass flex w-full max-w-sm flex-col items-center gap-4 p-7 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Send size={27} aria-hidden="true" />
          </span>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">Откройте приложение в Telegram</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Вернитесь в чат с ботом и нажмите кнопку Mini App. Так Telegram безопасно подтвердит владельца каналов.
            </p>
          </div>
        </section>
      </main>
    )
  }

  return children
}
