'use client'

import useSWR from 'swr'
import { Link2, Lock } from 'lucide-react'
import { Card, PageHeader, StatusPill } from '@/components/ui'

type Channel = {
  chat_id: string
  title: string | null
  topic: string
  mode: string
  is_active: boolean
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function Row({ label, value, right }: { label: string; value?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {value ? <span className="font-mono text-sm">{value}</span> : null}
        {right}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { data, isLoading } = useSWR<{ channel: Channel | null }>('/api/config', fetcher)
  const channel = data?.channel

  return (
    <div>
      <PageHeader title="Настройки и безопасность" />
      <div className="flex flex-col gap-4 p-4">
        <section aria-label="Канал">
          <h2 className="mb-2 px-1 text-sm text-muted-foreground">Канал</h2>
          <Card className="!py-1.5 divide-y divide-border">
            {isLoading ? (
              <p className="py-2.5 text-sm text-muted-foreground">Загрузка…</p>
            ) : channel ? (
              <>
                <Row
                  label={channel.chat_id}
                  right={
                    <span className="flex items-center gap-1.5">
                      <StatusPill tone={channel.is_active ? 'green' : 'dim'}>
                        {channel.is_active ? 'подключен' : 'выключен'}
                      </StatusPill>
                      <Link2 size={14} className="text-primary" aria-hidden="true" />
                    </span>
                  }
                />
                <Row label="Тема по умолчанию" value={channel.topic} />
                <Row label="Режим" value={channel.mode} />
              </>
            ) : (
              <p className="py-2.5 text-sm leading-relaxed text-muted-foreground">
                Канал ещё не подключён. Запустите бота с настроенным CHANNEL_ID — он
                зарегистрируется автоматически при первом посте.
              </p>
            )}
          </Card>
        </section>

        <section aria-label="Прокси">
          <h2 className="mb-2 px-1 text-sm text-muted-foreground">Прокси</h2>
          <Card className="!py-1.5 divide-y divide-border">
            <Row
              label="SOCKS5 / HTTP"
              right={
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">env: PROXY_URL</span>
                  <span className="neon-glow size-2 rounded-full bg-primary" aria-hidden="true" />
                </span>
              }
            />
          </Card>
        </section>

        <section aria-label="API хранилище">
          <h2 className="mb-2 px-1 text-sm text-muted-foreground">API хранилище</h2>
          <Card className="flex items-center justify-between !p-3">
            <div className="flex items-center gap-2.5">
              <Lock size={16} className="text-primary" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">Ключи провайдеров</span>
            </div>
            <StatusPill>только env бота</StatusPill>
          </Card>
        </section>

        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Секреты никогда не попадают в Mini App и базу данных — они живут только в переменных
          окружения бота.
        </p>
      </div>
    </div>
  )
}
