'use client'

import useSWR from 'swr'
import { Card, PageHeader } from '@/components/ui'

type Channel = {
  chat_id: string
  title: string | null
  topic: string
  mode: string
  is_active: boolean
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function SettingsPage() {
  const { data, isLoading } = useSWR<{ channel: Channel | null }>('/api/config', fetcher)
  const channel = data?.channel

  return (
    <div>
      <PageHeader title="Настройки" />
      <div className="flex flex-col gap-4 p-4">
        <section aria-label="Канал">
          <h2 className="mb-2 text-sm text-muted-foreground">Канал</h2>
          <Card className="flex flex-col gap-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Загрузка…</p>
            ) : channel ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{channel.chat_id}</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] ${
                      channel.is_active
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {channel.is_active ? 'подключён' : 'выключен'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Тема по умолчанию</span>
                  <span>{channel.topic}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Режим</span>
                  <span>{channel.mode}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Канал ещё не подключён. Запустите бота с настроенным CHANNEL_ID — он
                зарегистрируется автоматически при первом посте.
              </p>
            )}
          </Card>
        </section>

        <section aria-label="Секреты">
          <h2 className="mb-2 text-sm text-muted-foreground">API-ключи</h2>
          <Card>
            <p className="text-sm text-muted-foreground">
              Ключи провайдеров хранятся только в переменных окружения бота и никогда не
              передаются в Mini App.
            </p>
          </Card>
        </section>
      </div>
    </div>
  )
}
