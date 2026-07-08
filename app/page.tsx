'use client'

import useSWR from 'swr'
import { Activity, RefreshCw } from 'lucide-react'
import { Card, PageHeader, StatCard } from '@/components/ui'

type Stats = {
  totalPosts: number
  postsToday: number
  queued: number
  lastPost: { text: string; topic: string; published_at: string } | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function DashboardPage() {
  const { data, isLoading, mutate } = useSWR<Stats>('/api/stats', fetcher)

  return (
    <div>
      <PageHeader
        title="Командный центр"
        action={
          <button
            type="button"
            onClick={() => mutate()}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw size={14} aria-hidden="true" />
            Обновить
          </button>
        }
      />

      <div className="flex flex-col gap-4 p-4">
        <Card className="flex flex-col items-center gap-2 py-6">
          <div className="flex size-24 items-center justify-center rounded-full border-4 border-primary/30">
            <Activity size={36} className="text-primary" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold tracking-wide text-primary">
            {isLoading ? 'ЗАГРУЗКА...' : 'СИСТЕМА АКТИВНА'}
          </p>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Постов сегодня" value={String(data?.postsToday ?? '—')} />
          <StatCard label="Очередь" value={String(data?.queued ?? '—')} />
          <StatCard label="Всего постов" value={String(data?.totalPosts ?? '—')} />
        </div>

        <section aria-label="Последний автопост">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Последний автопост</h2>
          <Card>
            {data?.lastPost ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm leading-relaxed">{data.lastPost.text}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="text-primary">{data.lastPost.topic}</span>
                  <time dateTime={data.lastPost.published_at}>
                    {new Date(data.lastPost.published_at).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {isLoading ? 'Загрузка…' : 'Пока нет опубликованных постов'}
              </p>
            )}
          </Card>
        </section>
      </div>
    </div>
  )
}
