'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import {
  ExternalLink,
  Radio,
  KeyRound,
  CalendarClock,
  Check,
  ChevronRight,
  Sparkles,
  Users,
  Clock,
} from 'lucide-react'
import { PageHeader, StatCard, Skeleton, SectionTitle } from '@/components/ui'
import { swrFetcher as fetcher, haptic } from '@/lib/client'

type Stats = {
  totalPosts: number
  postsToday: number
  queued: number
  lastPost: { text: string; topic: string; published_at: string | null; image_url: string | null } | null
  nextPostAt: string | null
  subscribers: { current: number | null; delta24h: number | null; series: number[] } | null
}

/** «через 2 ч 14 мин» — живой отсчёт до следующего поста */
function useCountdown(target: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    if (!target) {
      setLabel(null)
      return
    }
    function tick() {
      const ms = new Date(target as string).getTime() - Date.now()
      if (ms <= 0) {
        setLabel('вот-вот')
        return
      }
      const totalMin = Math.round(ms / 60000)
      const d = Math.floor(totalMin / 1440)
      const h = Math.floor((totalMin % 1440) / 60)
      const m = totalMin % 60
      if (d > 0) setLabel(`через ${d} д ${h} ч`)
      else if (h > 0) setLabel(`через ${h} ч ${m} мин`)
      else setLabel(`через ${m} мин`)
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [target])
  return label
}

/** Мини-график динамики подписчиков (простая ломаная) */
function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const w = 120
  const h = 34
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const points = data
    .map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / span) * (h - 8)).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Динамика подписчиков за 7 дней" className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

type ConfigData = {
  channel: { chat_id: string; is_active: boolean } | null
  providers: { provider: string; is_enabled: boolean }[]
}

type KeysData = { keys: { id: number; is_active: boolean }[] }
type SchedulesData = { schedules: { id: number; is_active: boolean }[] }

function OnboardingCard({
  hasChannel,
  hasKey,
  hasSchedule,
}: {
  hasChannel: boolean
  hasKey: boolean
  hasSchedule: boolean
}) {
  const steps = [
    {
      done: hasChannel,
      icon: Radio,
      title: 'Подключите канал',
      description: 'Добавьте бота администратором в свой канал',
      href: '/more/settings',
    },
    {
      done: hasKey,
      icon: KeyRound,
      title: 'Добавьте API-ключ',
      description: 'Свой ключ — свои лимиты и приоритет генерации',
      href: '/more/keys',
    },
    {
      done: hasSchedule,
      icon: CalendarClock,
      title: 'Настройте расписание',
      description: 'Бот будет публиковать посты сам, без вас',
      href: '/schedule',
    },
  ]
  const doneCount = steps.filter((s) => s.done).length

  return (
    <section aria-label="Настройка системы" className="glass-featured flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-primary" aria-hidden="true" />
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Запуск за 3 шага</h2>
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Настройте автопостинг один раз — дальше всё само
          </p>
        </div>
        <span className="num shrink-0 text-[13px] font-medium text-muted-foreground">{doneCount}/3</span>
      </div>

      <div
        className="flex gap-1.5"
        role="progressbar"
        aria-valuenow={doneCount}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-label={`Выполнено ${doneCount} из ${steps.length} шагов`}
      >
        {steps.map((step, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
              step.done ? 'bg-primary' : 'bg-white/10'
            }`}
            style={step.done ? { boxShadow: '0 0 8px -1px rgba(94,106,210,0.5)' } : undefined}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {steps.map((step) => (
          <Link
            key={step.title}
            href={step.href}
            onClick={() => haptic('light')}
            className={`pressable flex items-center gap-3 rounded-lg p-3 ${step.done ? 'step-done' : 'step-pending'}`}
          >
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                step.done ? 'bg-[rgba(76,183,130,0.18)]' : 'bg-white/5'
              }`}
            >
              {step.done ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                <step.icon size={15} aria-hidden="true" />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={`text-[13px] font-medium ${step.done ? '' : 'text-foreground'}`}>
                {step.title}
              </span>
              {!step.done ? (
                <span className="text-[11px] leading-relaxed text-muted-foreground">{step.description}</span>
              ) : null}
            </span>
            {!step.done ? <ChevronRight size={15} className="shrink-0 opacity-60" aria-hidden="true" /> : null}
          </Link>
        ))}
      </div>
    </section>
  )
}

function ActiveHero({
  chatId,
  postsToday,
  queued,
  nextPostAt,
  subscribers,
}: {
  chatId: string
  postsToday: number
  queued: number
  nextPostAt: string | null
  subscribers: Stats['subscribers']
}) {
  const countdown = useCountdown(nextPostAt)
  const delta = subscribers?.delta24h

  return (
    <section aria-label="Статус системы" className="glass-featured flex flex-col gap-5 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="status-dot" aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">Система активна</span>
        </div>
        <span className="rounded-full border border-border bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground">
          {chatId}
        </span>
      </div>

      {countdown ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/25 bg-primary/[0.07] px-3.5 py-2.5">
          <Clock size={15} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="text-[13px] text-foreground">
            Следующий пост <strong className="font-semibold">{countdown}</strong>
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-white/[0.03] px-3.5 py-2.5">
          <Clock size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-[13px] text-muted-foreground">Нет активных слотов расписания</span>
        </div>
      )}

      <div className="flex items-end justify-between gap-4">
        <div className="flex items-end gap-7">
          <div className="flex flex-col">
            <span className="num text-[34px] font-semibold leading-none text-foreground">{postsToday}</span>
            <span className="mt-1.5 text-[11px] text-muted-foreground">постов сегодня</span>
          </div>
          <div className="flex flex-col">
            <span className="num text-[34px] font-semibold leading-none text-foreground">{queued}</span>
            <span className="mt-1.5 text-[11px] text-muted-foreground">в очереди</span>
          </div>
        </div>
      </div>

      {subscribers?.current !== null && subscribers?.current !== undefined ? (
        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <div className="flex items-center gap-2.5">
            <Users size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex flex-col">
              <span className="num text-[17px] font-semibold leading-tight text-foreground">
                {subscribers.current.toLocaleString('ru-RU')}
              </span>
              <span className="text-[11px] text-muted-foreground">
                подписчиков
                {typeof delta === 'number' && delta !== 0 ? (
                  <span className={delta > 0 ? ' text-[rgb(76,183,130)]' : ' text-destructive'}>
                    {' '}
                    {delta > 0 ? '+' : ''}
                    {delta} за сутки
                  </span>
                ) : null}
              </span>
            </div>
          </div>
          <Sparkline data={subscribers.series} />
        </div>
      ) : null}
    </section>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-[180px] w-full !rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-[86px] !rounded-xl" />
        <Skeleton className="h-[86px] !rounded-xl" />
      </div>
      <Skeleton className="h-[120px] w-full !rounded-xl" />
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading: statsLoading } = useSWR<Stats>('/api/stats', fetcher)
  const { data: config, isLoading: configLoading } = useSWR<ConfigData>('/api/config', fetcher)
  const { data: keysData } = useSWR<KeysData>('/api/keys', fetcher)
  const { data: schedulesData } = useSWR<SchedulesData>('/api/schedules', fetcher)

  const isLoading = statsLoading || configLoading

  const hasChannel = Boolean(config?.channel?.is_active)
  const hasKey = (keysData?.keys ?? []).some((k) => k.is_active)
  const hasSchedule = (schedulesData?.schedules ?? []).some((s) => s.is_active)
  const setupComplete = hasChannel && hasKey && hasSchedule

  const lastPost = data?.lastPost ?? null
  const enabledProviders = config?.providers?.filter((p) => p.is_enabled).length
  const totalProviders = config?.providers?.length

  const channelUrl = config?.channel?.chat_id?.startsWith('@')
    ? `https://t.me/${config.channel.chat_id.slice(1)}`
    : null

  return (
    <div>
      <PageHeader
        title="Обзор"
        subtitle={
          setupComplete ? 'Автопостинг работает в фоне' : 'Настройте систему и запустите автопостинг'
        }
      />

      <div className="fade-up flex flex-col gap-6 px-5 py-6">
        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            {setupComplete ? (
              <ActiveHero
                chatId={config?.channel?.chat_id ?? ''}
                postsToday={data?.postsToday ?? 0}
                queued={data?.queued ?? 0}
                nextPostAt={data?.nextPostAt ?? null}
                subscribers={data?.subscribers ?? null}
              />
            ) : (
              <OnboardingCard hasChannel={hasChannel} hasKey={hasKey} hasSchedule={hasSchedule} />
            )}

            {setupComplete ? (
              <section aria-label="Показатели" className="flex flex-col gap-3">
                <SectionTitle>Показатели</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Всего постов" value={data ? String(data.totalPosts) : '—'} />
                  <StatCard
                    label="Провайдеры"
                    value={totalProviders ? `${enabledProviders}/${totalProviders}` : '—'}
                    hint={totalProviders ? 'онлайн' : undefined}
                  />
                </div>
              </section>
            ) : null}

            <section aria-label="Последний автопост" className="flex flex-col gap-3">
              <SectionTitle
                action={
                  lastPost?.published_at ? (
                    <time className="text-[12px] text-muted-foreground" dateTime={lastPost.published_at}>
                      {new Date(lastPost.published_at).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  ) : undefined
                }
              >
                Последний автопост
              </SectionTitle>

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
                      onClick={() => haptic('light')}
                      className="btn-outline-green pressable flex w-full items-center justify-center gap-2 py-2.5 text-[13px]"
                    >
                      Открыть в канале
                      <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              ) : (
                <div className="glass flex flex-col items-center gap-3 px-5 py-8 text-center">
                  <p className="text-[13px] font-medium text-foreground">Постов пока нет</p>
                  <p className="max-w-[260px] text-[12px] leading-relaxed text-muted-foreground">
                    {setupComplete
                      ? 'Первый пост выйдет по расписанию, или создайте его вручную прямо сейчас.'
                      : 'Завершите настройку выше — и бот начнёт публиковать сам.'}
                  </p>
                  <Link
                    href="/generator"
                    onClick={() => haptic('light')}
                    className="btn-green pressable mt-1 px-5 py-2.5 text-[13px]"
                  >
                    Создать первый пост
                  </Link>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
