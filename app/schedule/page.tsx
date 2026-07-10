'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Plus, Trash2 } from 'lucide-react'
import { PageHeader, StatusPill, Toggle } from '@/components/ui'
import { swrFetcher as fetcher, apiFetch } from '@/lib/client'

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
    setSaving(true)
    try {
      await apiFetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postTime: time }),
      })
      mutate()
    } finally {
      setSaving(false)
    }
  }

  async function toggleSchedule(id: number, isActive: boolean) {
    await apiFetch(`/api/schedules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    })
    mutate()
  }

  async function removeSchedule(id: number) {
    await apiFetch(`/api/schedules/${id}`, { method: 'DELETE' })
    mutate()
  }

  const slots = [...(data?.schedules ?? [])].sort((a, b) => a.post_time.localeCompare(b.post_time))
  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

  return (
    <div>
      <PageHeader title="Расписание" />

      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between px-1">
          <p className="text-sm font-medium text-foreground">Сегодня, {today}</p>
          <span className="text-[11px] text-muted-foreground">
            {slots.length > 0 ? `${slots.length} слот(ов)` : ''}
          </span>
        </div>

        <div className="glass flex items-center gap-3 p-3">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="Время публикации"
            className="flex-1 rounded-xl border border-primary/20 bg-[rgba(8,28,20,0.7)] px-4 py-2.5 font-mono text-sm outline-none focus:border-primary/60"
          />
          <button
            type="button"
            onClick={addSchedule}
            disabled={saving}
            className="btn-green flex items-center gap-1.5 px-4 py-2.5 text-sm disabled:opacity-50"
          >
            <Plus size={16} aria-hidden="true" />
            Добавить
          </button>
        </div>

        {isLoading ? (
          <p className="px-1 text-sm text-muted-foreground">Загрузка…</p>
        ) : slots.length === 0 ? (
          <div className="glass flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-sm text-foreground">Расписание пусто</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Добавьте время публикации — бот будет автоматически постить в канал в указанные часы каждый день.
            </p>
          </div>
        ) : (
          <section aria-label="Слоты расписания" className="relative flex flex-col gap-0">
            {slots.map((s, i) => (
              <div key={s.id} className="relative flex gap-3 pb-4">
                <div className="flex w-14 shrink-0 flex-col items-center">
                  <span className="text-center font-mono text-[11px] leading-tight text-muted-foreground">
                    {s.post_time.slice(0, 5)}
                  </span>
                  <span
                    className={`mt-1.5 size-2.5 rounded-full ${s.is_active ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                    style={s.is_active ? { boxShadow: '0 0 8px rgba(47,226,142,0.7)' } : undefined}
                    aria-hidden="true"
                  />
                  {i < slots.length - 1 ? (
                    <span className="mt-1 w-px flex-1 bg-primary/25" aria-hidden="true" />
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
