'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Plus, Trash2, CalendarClock } from 'lucide-react'
import { PageHeader, StatusPill, Toggle, Skeleton, EmptyState } from '@/components/ui'
import { swrFetcher as fetcher, apiFetch, haptic } from '@/lib/client'

type Schedule = {
  id: number
  post_time: string
  timezone: string
  is_active: boolean
  chat_id: string
  topic: string
  mode: string
}

export default function SchedulePage() {
  const { data, mutate, isLoading } = useSWR<{ schedules: Schedule[] }>('/api/schedules', fetcher)
  const [time, setTime] = useState('11:00')
  const [saving, setSaving] = useState(false)

  async function addSchedule() {
    haptic('medium')
    setSaving(true)
    try {
      await apiFetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postTime: time }),
      })
      haptic('success')
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

        <div className="glass flex items-center gap-3 p-3">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="Время публикации"
            className="flex-1 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm outline-none focus:border-primary/50"
          />
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

        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[62px] !rounded-xl" />
            <Skeleton className="h-[62px] !rounded-xl" />
          </div>
        ) : slots.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={18} aria-hidden="true" />}
            title="Расписание пусто"
            description="Добавьте время публикации выше — бот будет автоматически постить в канал в указанные часы каждый день."
          />
        ) : (
          <section aria-label="Слоты расписания" className="relative flex flex-col gap-0">
            {slots.map((s, i) => (
              <div key={s.id} className="relative flex gap-3 pb-4">
                <div className="flex w-14 shrink-0 flex-col items-center">
                  <span className="text-center text-[12px] leading-tight text-muted-foreground">
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
                    <span className="truncate text-[13px] text-foreground">{s.topic}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{s.chat_id}</span>
                  </div>
                  <StatusPill tone={s.is_active ? 'green' : 'blue'}>
                    {s.is_active ? 'scheduled' : 'off'}
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
