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

export default function StatsPage() {
  const { data, isLoading } = useSWR<UsageData>('/api/usage', fetcher, { refreshInterval: 30000 })

  const totals = data?.totals
  const successRate =
    totals && Number(totals.generations) > 0
      ? Math.round((Number(totals.generations_ok) / Number(totals.generations)) * 100)
      : null

  const maxDaily = Math.max(1, ...(data?.daily ?? []).map((d) => Number(d.posts)))

  return (
    <main className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <PageHeader title="Статистика" />

      <div className="grid grid-cols-2 gap-2">
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
    </main>
  )
}
