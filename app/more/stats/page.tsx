'use client'

import useSWR from 'swr'
import { PageHeader, Card, StatCard } from '@/components/ui'

import { swrFetcher as fetcher, apiFetch } from '@/lib/client'

type UsageData = {
  totals: {
    generations: number
    generations_ok: number
    publishes: number
    publish_failures: number
    avg_duration_ms: number
  } | null
  byProvider: {
    provider: string
    model: string | null
    attempts: number
    successes: number
    avg_ms: number
  }[]
  daily: { day: string; posts: number }[]
  recentErrors: { provider: string | null; model: string | null; error: string | null; created_at: string }[]
}

type AnalyticsData = {
  memberSeries: { channel_id: number; channel_title: string | null; day: string; members: number }[]
  topicBreakdown: { topic: string; posts: number }[]
}

function MembersCard({ series }: { series: AnalyticsData['memberSeries'] }) {
  // Группируем по каналам: берём первую и последнюю точку для дельты
  const byChannel = new Map<number, { title: string; points: { day: string; members: number }[] }>()
  for (const row of series) {
    const entry = byChannel.get(row.channel_id) ?? {
      title: row.channel_title || `Канал ${row.channel_id}`,
      points: [],
    }
    entry.points.push({ day: row.day, members: Number(row.members) })
    byChannel.set(row.channel_id, entry)
  }
  if (byChannel.size === 0) return null

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold">Подписчики (30 дней)</h2>
      <ul className="flex flex-col gap-3">
        {[...byChannel.entries()].map(([id, { title, points }]) => {
          const first = points[0]?.members ?? 0
          const last = points[points.length - 1]?.members ?? 0
          const delta = last - first
          const max = Math.max(1, ...points.map((p) => p.members))
          const min = Math.min(...points.map((p) => p.members))
          const range = Math.max(1, max - min)
          return (
            <li key={id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] font-medium text-foreground">{title}</span>
                <span className="num shrink-0 text-[12px] text-foreground">
                  {last.toLocaleString('ru-RU')}
                  {delta !== 0 ? (
                    <span className={delta > 0 ? 'text-primary' : 'text-destructive'}>
                      {' '}
                      {delta > 0 ? '+' : ''}
                      {delta}
                    </span>
                  ) : null}
                </span>
              </div>
              {points.length > 1 ? (
                <div className="flex h-8 items-end gap-px" role="img" aria-label={`Динамика подписчиков: ${title}`}>
                  {points.map((p, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm bg-primary/50"
                      style={{ height: `${Math.max(12, ((p.members - min) / range) * 100)}%` }}
                    />
                  ))}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export default function StatsPage() {
  const { data, isLoading } = useSWR<UsageData>('/api/usage', fetcher, { refreshInterval: 30000 })
  const { data: analytics } = useSWR<AnalyticsData>('/api/analytics', fetcher, { refreshInterval: 60000 })

  const totals = data?.totals
  const successRate =
    totals && Number(totals.generations) > 0
      ? Math.round((Number(totals.generations_ok) / Number(totals.generations)) * 100)
      : null

  const maxDaily = Math.max(1, ...(data?.daily ?? []).map((d) => Number(d.posts)))

  return (
    <main>
      <PageHeader title="Статистика" subtitle="Использование провайдеров и активность" />

      <div className="fade-up flex flex-col gap-4 px-5 py-6">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Генераций (30 дн)" value={totals ? String(totals.generations) : '—'} />
        <StatCard label="Успешность" value={successRate !== null ? `${successRate}%` : '—'} />
        <StatCard label="Публикаций" value={totals ? String(totals.publishes) : '—'} />
        <StatCard label="Ср. время" value={totals ? `${(Number(totals.avg_duration_ms) / 1000).toFixed(1)}с` : '—'} />
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Посты за 14 дней</h2>
        {data?.daily?.length ? (
          <div className="flex h-24 items-end gap-1" role="img" aria-label="График постов по дням">
            {data.daily.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/70"
                  style={{ height: `${Math.max(8, (Number(d.posts) / maxDaily) * 100)}%` }}
                />
                <span className="font-mono text-[8px] text-muted-foreground">
                  {new Date(d.day).getDate()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {isLoading ? 'Загрузка...' : 'Пока нет данных. Статистика появится после первых постов.'}
          </p>
        )}
      </Card>

      {analytics?.memberSeries?.length ? <MembersCard series={analytics.memberSeries} /> : null}

      {analytics?.topicBreakdown?.length ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Популярные темы</h2>
          <ul className="flex flex-col gap-2">
            {analytics.topicBreakdown.map((t) => {
              const maxPosts = Math.max(1, ...analytics.topicBreakdown.map((x) => Number(x.posts)))
              return (
                <li key={t.topic} className="flex items-center gap-2.5">
                  <span className="w-24 shrink-0 truncate text-[12px] text-foreground">{t.topic}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-primary/60"
                      style={{ width: `${(Number(t.posts) / maxPosts) * 100}%` }}
                    />
                  </div>
                  <span className="num w-6 shrink-0 text-right text-[11px] text-muted-foreground">{t.posts}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-3 text-sm font-semibold">По провайдерам</h2>
        {data?.byProvider?.length ? (
          <ul className="flex flex-col gap-2">
            {data.byProvider.map((p, i) => {
              const rate = Number(p.attempts) > 0 ? Math.round((Number(p.successes) / Number(p.attempts)) * 100) : 0
              return (
                <li key={i} className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{p.provider}</p>
                    {p.model && <p className="truncate font-mono text-[10px] text-muted-foreground">{p.model}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 font-mono text-[10px]">
                    <span className="text-muted-foreground">{p.attempts} зап.</span>
                    <span className={rate >= 80 ? 'text-primary' : 'text-amber-400'}>{rate}%</span>
                    <span className="text-muted-foreground">{(Number(p.avg_ms) / 1000).toFixed(1)}с</span>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            {isLoading ? 'Загрузка...' : 'Нет данных по провайдерам.'}
          </p>
        )}
      </Card>

      {data?.recentErrors?.length ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-amber-400">Последние ошибки</h2>
          <ul className="flex flex-col gap-2">
            {data.recentErrors.map((e, i) => (
              <li key={i} className="text-[11px]">
                <span className="font-mono text-muted-foreground">
                  {new Date(e.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>{' '}
                <span className="font-medium">{e.provider ?? '—'}</span>{' '}
                <span className="text-muted-foreground">{e.error ?? ''}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      </div>
    </main>
  )
}
