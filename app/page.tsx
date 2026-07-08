'use client'

import useSWR from 'swr'
import { ExternalLink, RefreshCw, ShieldCheck, Eye, Heart, MessageCircle } from 'lucide-react'
import { Card, PageHeader, StatCard } from '@/components/ui'

type Stats = {
  totalPosts: number
  postsToday: number
  queued: number
  lastPost: { text: string; topic: string; published_at: string; image_url: string | null } | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const demoLastPost = {
  text: 'В японском языке нет ругательств сильнее, чем «дурак» и «идиот»',
  topic: 'Научные факты',
  published_at: null as string | null,
  image_url: '/demo/japan.png',
}

function SystemRing({ active }: { active: boolean }) {
  return (
    <div className="relative flex size-40 shrink-0 items-center justify-center">
      <div className="pulse-ring absolute inset-0 rounded-full border border-primary/25" />
      <div className="ring-glow absolute inset-1.5 rounded-full border-[3px] border-primary/60" />
      <div className="absolute inset-4 rounded-full border border-primary/15 bg-[rgba(8,28,20,0.6)]" />
      <div className="relative flex flex-col items-center gap-0.5">
        <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">Система</span>
        <span className="text-glow font-mono text-[13px] font-bold tracking-[0.18em] text-primary">
          {active ? 'АКТИВНА' : '...'}
        </span>
        <svg width="76" height="24" viewBox="0 0 88 26" aria-hidden="true">
          <path
            className="ecg-line"
            d="M0 13 L14 13 L20 4 L27 22 L33 8 L38 13 L54 13 L60 6 L66 20 L71 13 L88 13"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="1.8"
            style={{ filter: 'drop-shadow(0 0 5px rgba(47,226,142,0.8))' }}
          />
        </svg>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading, mutate } = useSWR<Stats>('/api/stats', fetcher)

  const lastPost = data?.lastPost ?? demoLastPost
  const postsToday = data?.postsToday ?? 12
  const queued = data?.queued ?? 3

  return (
    <div>
      <PageHeader
        title="Командный центр"
        action={
          <button
            type="button"
            onClick={() => mutate()}
            className="btn-outline-green flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <RefreshCw size={13} aria-hidden="true" />
            Обновить
          </button>
        }
      />

      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <div className="flex min-w-0 flex-col gap-2">
            <StatCard label="Постов сегодня" value={String(postsToday)} hint="+20%" />
            <StatCard label="Провайдеры" value="5/5" hint="онлайн" />
          </div>
          <SystemRing active={!isLoading} />
          <div className="flex min-w-0 flex-col gap-2">
            <StatCard label="Очередь" value={String(queued)} hint="поста" />
            <StatCard label="Повторы" value="0" hint="за 7 дней" />
          </div>
        </div>

        <section aria-label="Последний автопост" className="glass p-3.5">
          <div className="mb-2.5 flex items-center justify-between px-0.5">
            <h2 className="text-sm font-medium text-foreground">Последний автопост</h2>
            {lastPost.published_at ? (
              <time className="font-mono text-[11px] text-muted-foreground" dateTime={lastPost.published_at}>
                {new Date(lastPost.published_at).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground">Сегодня, 08:30</span>
            )}
          </div>

          <div className="glass-strong flex gap-3 p-3">
            {lastPost.image_url ? (
              <img
                src={lastPost.image_url || "/placeholder.svg"}
                alt=""
                className="size-20 shrink-0 rounded-xl border border-primary/25 object-cover"
              />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5 py-0.5">
              <p className="text-[13px] leading-snug text-foreground">{lastPost.text}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-primary underline decoration-primary/40 underline-offset-2">
                  {lastPost.topic}
                </span>
                <ShieldCheck size={16} className="text-primary" aria-hidden="true" />
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex items-center gap-4 px-1 text-muted-foreground">
            <span className="flex items-center gap-1 font-mono text-[11px]">
              <Eye size={13} aria-hidden="true" /> 26
            </span>
            <span className="flex items-center gap-1 font-mono text-[11px]">
              <Heart size={13} aria-hidden="true" /> 3
            </span>
            <span className="flex items-center gap-1 font-mono text-[11px]">
              <MessageCircle size={13} aria-hidden="true" /> 3
            </span>
          </div>

          <button
            type="button"
            className="btn-outline-green mt-3 flex w-full items-center justify-center gap-2 py-2.5 text-xs"
          >
            Открыть в канале
            <ExternalLink size={13} aria-hidden="true" />
          </button>
        </section>
      </div>
    </div>
  )
}
