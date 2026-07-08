'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Plus } from 'lucide-react'
import { Card, PageHeader, StatusPill } from '@/components/ui'

type Schedule = {
  id: number
  post_time: string
  timezone: string
  is_active: boolean
  chat_id: string
  topic: string
  mode: string
}

const TABS = ['24 часа', '7 дней', '30 дней', 'Календарь']

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function SchedulePage() {
  const { data, mutate } = useSWR<{ schedules: Schedule[] }>('/api/schedules', fetcher)
  const [time, setTime] = useState('11:00')
  const [tab, setTab] = useState(0)
  const [saving, setSaving] = useState(false)

  async function addSchedule() {
    setSaving(true)
    try {
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postTime: time }),
      })
      mutate()
    } finally {
      setSaving(false)
    }
  }

  const schedules = [...(data?.schedules ?? [])].sort((a, b) => a.post_time.localeCompare(b.post_time))
  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

  return (
    <div>
      <PageHeader title="Расписание" />

      <div className="flex flex-col gap-4 p-4">
        <div role="tablist" aria-label="Период" className="flex gap-2 overflow-x-auto">
          {TABS.map((t, i) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === i}
              onClick={() => setTab(i)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-all ${
                tab === i ? 'btn-neon font-semibold' : 'border-border text-muted-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <Card className="flex items-center gap-3 !p-3">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="Время публикации"
            className="flex-1 rounded-xl border border-border bg-muted px-4 py-2.5 font-mono text-sm outline-none focus:border-primary/60"
          />
          <button
            type="button"
            onClick={addSchedule}
            disabled={saving}
            className="btn-neon flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            <Plus size={16} aria-hidden="true" />
            Добавить
          </button>
        </Card>

        <p className="px-1 text-xs uppercase tracking-widest text-muted-foreground">Сегодня, {today}</p>

        <section aria-label="Слоты расписания" className="relative flex flex-col gap-0">
          {schedules.length === 0 ? (
            <Card>
              <p className="text-sm text-muted-foreground">
                Расписаний пока нет. Добавьте время — бот будет публиковать пост каждый день в
                указанный час.
              </p>
            </Card>
          ) : (
            schedules.map((s, i) => (
              <div key={s.id} className="relative flex gap-3 pb-4">
                <div className="flex w-12 shrink-0 flex-col items-center">
                  <span className="font-mono text-xs text-muted-foreground">{s.post_time.slice(0, 5)}</span>
                  <span className="neon-glow mt-1.5 size-2 rounded-full bg-primary" aria-hidden="true" />
                  {i < schedules.length - 1 ? (
                    <span className="mt-1 w-px flex-1 bg-primary/20" aria-hidden="true" />
                  ) : null}
                </div>
                <Card className="flex flex-1 items-center justify-between !p-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm">{s.topic}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{s.chat_id}</span>
                  </div>
                  <StatusPill tone={s.is_active ? 'green' : 'dim'}>
                    {s.is_active ? 'scheduled' : 'off'}
                  </StatusPill>
                </Card>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
