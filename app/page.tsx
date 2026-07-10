'use client'

import useSWR from 'swr'
import { ExternalLink, RefreshCw } from 'lucide-react'
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

export default function DashboardPage() {
  const { data, isLoading, mutate } = useSWR<Stats>('/api/stats', fetcher)
  const { data: config } = useSWR<ConfigData>('/api/config', fetcher)

  const lastPost = data?.lastPost ?? null
  const enabledProviders = config?.providers?.filter((p) => p.is_enabled).length
  const totalProviders = config?.providers?.length
  const systemActive = !isLoading && Boolean(config?.channel?.is_active)

  const channelUrl = config?.channel?.chat_id?.startsWith('@')
    ? `https://t.me/${config.channel.chat_id.slice(1)}`
    : null

  return (
    <div>
      <PageHeader
        title="Обзор"
        action={
          <button
            type="button"
            onClick={() => mutate()}
            aria-label="Обновить данные"
            className="btn-outline-green flex items-center justify-center p-2"
          >
            <RefreshCw size={14} aria-hidden="true" />
          </button>
        }
      />

      <div className="fade-up flex flex-col gap-6 px-5 py-6">
        <section aria-label="Статус системы" className="glass-featured flex items-center justify-between p-5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <span className="status-dot" data-off={systemActive ? 'false' : 'true'} aria-hidden="true" />
              <span className="text-[15px] font-semibold tracking-tight text-foreground">
                {isLoading ? 'Загрузка' : systemActive ? 'Система активна' : 'Система не настроена'}
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {systemActive
                ? 'Автопостинг работает в штатном режиме'
                : 'Подключите канал, чтобы запустить автопостинг'}
            </p>
          </div>
          {config?.channel?.chat_id ? (
            <span className="text-[12px] text-muted-foreground">{config.channel.chat_id}</span>
          ) : null}
        </section>

        <section aria-label="Показатели" className="grid grid-cols-2 gap-3">
          <StatCard label="Постов сегодня" value={data ? String(data.postsToday) : '—'} />
          <StatCard label="В очереди" value={data ? String(data.queued) : '—'} />
          <StatCard
            label="Провайдеры"
            value={totalProviders ? `${enabledProviders}/${totalProviders}` : '—'}
            hint={totalProviders ? 'онлайн' : undefined}
          />
          <StatCard label="Всего постов" value={data ? String(data.totalPosts) : '—'} />
        </section>

        <section aria-label="Последний автопост" className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-[13px] font-medium text-muted-foreground">Последний автопост</h2>
            {lastPost?.published_at ? (
              <time className="text-[12px] text-muted-foreground" dateTime={lastPost.published_at}>
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
            <div className="glass flex flex-col gap-4 p-4">
              <div className="flex gap-3.5">
                {lastPost.image_url ? (
                  <img
                    src={lastPost.image_url || '/placeholder.svg'}
                    alt=""
                    className="size-16 shrink-0 rounded-lg border border-border object-cover"
                  />
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p className="text-[13px] leading-relaxed text-foreground">{lastPost.text}</p>
                  <span className="text-[12px] text-primary">{lastPost.topic}</span>
                </div>
              </div>

              {channelUrl ? (
                <a
                  href={channelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline-green flex w-full items-center justify-center gap-2 py-2.5 text-[13px]"
                >
                  Открыть в канале
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              ) : null}
            </div>
          ) : (
            <div className="glass flex flex-col items-center gap-1.5 px-5 py-8 text-center">
              <p className="text-[13px] font-medium text-foreground">
                {isLoading ? 'Загрузка…' : 'Постов пока нет'}
              </p>
              {!isLoading ? (
                <p className="max-w-[260px] text-[12px] leading-relaxed text-muted-foreground">
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
