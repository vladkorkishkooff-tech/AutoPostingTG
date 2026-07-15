import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Script from 'next/script'
import { BottomNav } from '@/components/bottom-nav'
import { TelegramGate } from '@/components/telegram-gate'
import './globals.css'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'AutoPostingTG',
  description: 'AI автопостинг для Telegram каналов',
}

export const viewport: Viewport = {
  themeColor: '#0d0e12',
  userScalable: false,
  initialScale: 1,
  maximumScale: 1,
  width: 'device-width',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning className={`bg-background ${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <TelegramGate>
          <div className="mx-auto flex min-h-dvh max-w-md flex-col">
            <main className="flex-1 pb-24">{children}</main>
            <BottomNav />
          </div>
        </TelegramGate>
      </body>
    </html>
  )
}
