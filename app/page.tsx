'use client'

import useSWR from 'swr'
import { ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react'
import { PageHeader, StatCard } from '@/components/ui'
import { swrFetcher as fetcher } from '@/lib/client'

type Stats = {
  totalPosts: number
  postsToday: number
  queued: number
  lastPost: { text: string; topic: string; published_at: string | null; image_url: string | null } | null
}

type ConfigData = {
  channel: { chat_id: string; is_active: boolean } | null
  providers: { provider: string; is_enabled: boolean }[]
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
  const { data: config } = useSWR<ConfigData>('/api/config', fetcher)

  const lastPost = data?.lastPost ?? null
  const enabledProviders = config?.providers?.filter((p) => p.is_enabled).length
  const totalProviders = config?.providers?.length

  const channelUrl = config?.channel?.chat_id?.startsWith('@')
    ? `https://t.me/${config.channel.chat_id.slice(1)}`
    : null

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
            <StatCard label="Постов сегодня" value={data ? String(data.postsToday) : '—'} hint="за 24 часа" />
            <StatCard
              label="Провайдеры"
              value={totalProviders ? `${enabledProviders}/${totalProviders}` : '—'}
              hint={totalProviders ? 'онлайн' : 'нет данных'}
            />
          </div>
          <SystemRing active={!isLoading && Boolean(config?.channel?.is_active)} />
          <div className="flex min-w-0 flex-col gap-2">
            <StatCard label="Очередь" value={data ? String(data.queued) : '—'} hint="постов" />
            <StatCard label="Всего постов" value={data ? String(data.totalPosts) : '—'} hint="опубликовано" />
          </div>
        </div>

        <section aria-label="Последний автопост" className="glass p-3.5">
          <div className="mb-2.5 flex items-center justify-between px-0.5">
            <h2 className="text-sm font-medium text-foreground">Последний автопост</h2>
            {lastPost?.published_at ? (
              <time className="font-mono text-[11px] text-muted-foreground" dateTime={lastPost.published_at}>
                {new Date(lastPost.published_at).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            ) : null}
          </div>

          {lastPost ? (
            <>
              <div className="glass-strong flex gap-3 p-3">
                {lastPost.image_url ? (
                  <img
                    src={lastPost.image_url || '/placeholder.svg'}
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

              {channelUrl ? (
                <a
                  href={channelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline-green mt-3 flex w-full items-center justify-center gap-2 py-2.5 text-xs"
                >
                  Открыть в канале
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              ) : null}
            </>
          ) : (
            <div className="glass-strong flex flex-col items-center gap-1.5 p-5 text-center">
              <p className="text-sm text-foreground">{isLoading ? 'Загрузка…' : 'Постов пока нет'}</p>
              {!isLoading ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Создайте первый пост в Генераторе или настройте Расписание — бот всё сделает сам.
                </p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
