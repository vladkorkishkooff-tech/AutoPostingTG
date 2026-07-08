'use client'

import useSWR from 'swr'
import { ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react'
import { Card, PageHeader, StatCard } from '@/components/ui'

type Stats = {
  totalPosts: number
  postsToday: number
  queued: number
  lastPost: { text: string; topic: string; published_at: string; image_url: string | null } | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function SystemRing({ active }: { active: boolean }) {
  return (
    <div className="relative flex size-36 shrink-0 items-center justify-center">
      <div className="ring-pulse absolute inset-0 rounded-full border border-primary/20" />
      <div className="absolute inset-2 rounded-full border-2 border-primary/40 neon-glow" />
      <div className="absolute inset-5 rounded-full border border-primary/15" />
      <div className="flex flex-col items-center gap-1">
        <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Система</span>
        <span className="neon-text font-mono text-xs font-bold tracking-widest text-primary">
          {active ? 'АКТИВНА' : '...'}
        </span>
        <svg width="72" height="22" viewBox="0 0 88 26" aria-hidden="true">
          <path
            className="ecg-line"
            d="M0 13 L14 13 L20 4 L27 22 L33 8 L38 13 L54 13 L60 6 L66 20 L71 13 L88 13"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="1.6"
            style={{ filter: 'drop-shadow(0 0 4px rgba(53,224,141,0.7))' }}
          />
        </svg>
      </div>
    </div>
  )
}

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
            className="flex items-center gap-1.5 rounded-full border border-primary/30 px-3 py-1.5 text-xs text-primary"
          >
            <RefreshCw size={13} aria-hidden="true" />
            Обновить
          </button>
        }
      />

      <div className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <div className="flex min-w-0 flex-col gap-2">
            <StatCard label="Постов сегодня" value={String(data?.postsToday ?? '—')} hint={data?.postsToday ? `+${data.postsToday}` : undefined} />
            <StatCard label="Провайдеры" value="5/5" hint="онлайн" />
          </div>
          <SystemRing active={!isLoading} />
          <div className="flex min-w-0 flex-col gap-2">
            <StatCard label="Очередь" value={String(data?.queued ?? '—')} hint="поста" />
            <StatCard label="Повторы" value="0" hint="за 7 дней" />
          </div>
        </div>

        <section aria-label="Последний автопост">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-sm font-medium text-muted-foreground">Последний автопост</h2>
            {data?.lastPost ? (
              <time
                className="font-mono text-[11px] text-muted-foreground"
                dateTime={data.lastPost.published_at}
              >
                {new Date(data.lastPost.published_at).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            ) : null}
          </div>
          <Card>
            {data?.lastPost ? (
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  {data.lastPost.image_url ? (
                    <img
                      src={data.lastPost.image_url || "/placeholder.svg"}
                      alt=""
                      className="size-16 shrink-0 rounded-xl border border-primary/20 object-cover"
                    />
                  ) : null}
                  <div className="flex flex-1 flex-col gap-1.5">
                    <p className="text-sm leading-relaxed">{data.lastPost.text}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-primary">{data.lastPost.topic}</span>
                      <ShieldCheck size={14} className="text-primary" aria-hidden="true" />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-xs text-muted-foreground"
                >
                  Открыть в канале
                  <ExternalLink size={13} aria-hidden="true" />
                </button>
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
