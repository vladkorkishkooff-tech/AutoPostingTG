'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Plus, Trash2, CalendarClock, ChevronDown } from 'lucide-react'
import { PageHeader, StatusPill, Toggle, Skeleton } from '@/components/ui'
import { swrFetcher as fetcher, apiFetch, haptic } from '@/lib/client'

type Schedule = {
  id: number
  channel_id: number
  post_time: string
  timezone: string
  is_active: boolean
  chat_id: string
  channel_title: string | null
  topic: string
  mode: string
  slot_topic: string | null
  slot_mode: string | null
}

type Channel = {
  id: number
  chat_id: string
  title: string | null
  is_active: boolean
}

const MODES = [
  { id: '', label: 'Как у канала' },
  { id: 'normal', label: 'Стандарт' },
  { id: 'short', label: 'Коротко' },
  { id: 'long', label: 'Лонгрид' },
  { id: 'fun', label: 'Юмор' },
]

export default function SchedulePage() {
  const { data, mutate, isLoading } = useSWR<{ schedules: Schedule[] }>('/api/schedules', fetcher)
  const { data: channelsData } = useSWR<{ channels: Channel[] }>('/api/channels', fetcher)
  const [time, setTime] = useState('11:00')
  const [slotTopic, setSlotTopic] = useState('')
  const [slotMode, setSlotMode] = useState('')
  const [channelId, setChannelId] = useState<number | ''>('')
  const [showOptions, setShowOptions] = useState(false)
  const [saving, setSaving] = useState(false)

  const channels = (channelsData?.channels ?? []).filter((c) => c.is_active)
  const multiChannel = channels.length > 1

  async function addSchedule() {
    haptic('medium')
    setSaving(true)
    try {
      await apiFetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postTime: time,
          topic: slotTopic.trim() || undefined,
          mode: slotMode || undefined,
          channelId: channelId || undefined,
        }),
      })
      haptic('success')
      setSlotTopic('')
      setSlotMode('')
      mutate()
    } finally {
      setSaving(false)
    }
  }

  async function toggleSchedule(id: number, isActive: boolean) {
    haptic('light')
    await apiFetch(`/api/schedules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    })
    mutate()
  }

  async function removeSchedule(id: number) {
    haptic('medium')
    await apiFetch(`/api/schedules/${id}`, { method: 'DELETE' })
    mutate()
  }

  const slots = [...(data?.schedules ?? [])].sort((a, b) => a.post_time.localeCompare(b.post_time))
  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

  return (
    <div>
      <PageHeader title="Расписание" subtitle="Бот публикует посты сам — в заданное время каждый день" />

      <div className="fade-up flex flex-col gap-5 px-5 py-6">
        <div className="flex items-center justify-between px-0.5">
          <p className="text-[13px] font-medium text-foreground">Сегодня, {today}</p>
          <span className="text-[12px] text-muted-foreground">
            {slots.length > 0 ? `${slots.length} слот(ов)` : ''}
          </span>
        </div>

        <div className="glass flex flex-col gap-3 p-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Быстрый выбор времени">
            {['09:00', '12:00', '15:00', '19:00', '21:00'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  haptic('light')
                  setTime(t)
                }}
                aria-pressed={time === t}
                className={`num pressable rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  time === t
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border bg-white/[0.03] text-muted-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="Время публикации"
              className="flex-1 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm outline-none focus:border-primary/50"
            />
            <button
              type="button"
              onClick={() => {
                haptic('light')
                setShowOptions((v) => !v)
              }}
              aria-expanded={showOptions}
              aria-label="Дополнительные настройки слота"
              className="btn-outline-green pressable flex items-center justify-center p-2.5"
            >
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={`transition-transform ${showOptions ? 'rotate-180' : ''}`}
              />
            </button>
            <button
              type="button"
              onClick={addSchedule}
              disabled={saving}
              className="btn-green pressable flex items-center gap-1.5 px-4 py-2.5 text-sm disabled:opacity-50"
            >
              <Plus size={16} aria-hidden="true" />
              Добавить
            </button>
          </div>

          {showOptions ? (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              {multiChannel ? (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-muted-foreground">Канал</span>
                  <select
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value ? Number(e.target.value) : '')}
                    className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                  >
                    <option value="">Первый канал</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title || c.chat_id}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">
                  Тема слота (пусто — тема канала или пул тем)
                </span>
                <input
                  type="text"
                  value={slotTopic}
                  onChange={(e) => setSlotTopic(e.target.value)}
                  placeholder="напр. «космос» утром, «юмор» вечером"
                  className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">Режим текста</span>
                <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Режим текста слота">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={slotMode === m.id}
                      onClick={() => {
                        haptic('light')
                        setSlotMode(m.id)
                      }}
                      className={`pressable rounded-lg border px-1 py-2 text-[11px] font-medium transition-colors ${
                        slotMode === m.id
                          ? 'border-primary/50 bg-primary/10 text-foreground'
                          : 'border-border bg-white/[0.03] text-muted-foreground'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[62px] !rounded-xl" />
            <Skeleton className="h-[62px] !rounded-xl" />
          </div>
        ) : slots.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="eyebrow px-0.5">Так будет выглядеть ваш день</p>
            {[
              { t: '09:00', label: 'Утренний пост' },
              { t: '15:00', label: 'Дневной пост' },
              { t: '21:00', label: 'Вечерний пост' },
            ].map((g, i) => (
              <div key={g.t} className="flex gap-3">
                <div className="flex w-14 shrink-0 flex-col items-center">
                  <span className="num text-[12px] text-muted-foreground/50">{g.t}</span>
                  <span className="mt-1.5 size-2 rounded-full border border-dashed border-muted-foreground/40" aria-hidden="true" />
                  {i < 2 ? <span className="mt-1 w-px flex-1 border-l border-dashed border-border" aria-hidden="true" /> : null}
                </div>
                <div className="ghost-card flex flex-1 items-center gap-3 px-3.5 py-3">
                  <CalendarClock size={15} className="text-muted-foreground/50" aria-hidden="true" />
                  <span className="text-[12.5px] text-muted-foreground/60">{g.label} — добавьте слот выше</span>
                </div>
              </div>
            ))}
            <p className="px-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Бот публикует посты сам в указанные часы каждый день. Начните с 2–3 слотов — этого достаточно для стабильного роста.
            </p>
          </div>
        ) : (
          <section aria-label="Слоты расписания" className="relative flex flex-col gap-0">
            {slots.map((s, i) => (
              <div key={s.id} className="relative flex gap-3 pb-4">
                <div className="flex w-14 shrink-0 flex-col items-center">
                  <span className="num text-center text-[12px] leading-tight text-muted-foreground">
                    {s.post_time.slice(0, 5)}
                  </span>
                  <span
                    className={`mt-1.5 size-2 rounded-full ${s.is_active ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                    aria-hidden="true"
                  />
                  {i < slots.length - 1 ? (
                    <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />
                  ) : null}
                </div>
                <div className="glass flex flex-1 items-center gap-3 p-2.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13px] text-foreground">
                      {s.slot_topic || s.topic}
                      {s.slot_mode ? (
                        <span className="text-muted-foreground"> · {MODES.find((m) => m.id === s.slot_mode)?.label ?? s.slot_mode}</span>
                      ) : null}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {s.channel_title || s.chat_id}
                    </span>
                  </div>
                  <StatusPill tone={s.is_active ? 'green' : 'blue'}>
                    {s.is_active ? 'вкл' : 'выкл'}
                  </StatusPill>
                  <Toggle checked={s.is_active} onChange={(v) => toggleSchedule(s.id, v)} label="Активность слота" />
                  <button
                    type="button"
                    onClick={() => removeSchedule(s.id)}
                    aria-label={`Удалить слот ${s.post_time.slice(0, 5)}`}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
