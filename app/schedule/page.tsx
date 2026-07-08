'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Plus } from 'lucide-react'
import { Card, PageHeader } from '@/components/ui'

type Schedule = {
  id: number
  post_time: string
  timezone: string
  is_active: boolean
  chat_id: string
  topic: string
  mode: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function SchedulePage() {
  const { data, mutate } = useSWR<{ schedules: Schedule[] }>('/api/schedules', fetcher)
  const [time, setTime] = useState('11:00')
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

  const schedules = data?.schedules ?? []

  return (
    <div>
      <PageHeader title="Расписание" />

      <div className="flex flex-col gap-4 p-4">
        <Card className="flex items-center gap-3">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="Время публикации"
            className="flex-1 rounded-xl border border-border bg-muted px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={addSchedule}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Plus size={16} aria-hidden="true" />
            Добавить
          </button>
        </Card>

        <section aria-label="Слоты расписания" className="flex flex-col gap-3">
          {schedules.length === 0 ? (
            <Card>
              <p className="text-sm text-muted-foreground">
                Расписаний пока нет. Добавьте время — бот будет публиковать пост каждый день в
                указанный час.
              </p>
            </Card>
          ) : (
            schedules.map((s) => (
              <Card key={s.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold">{s.post_time.slice(0, 5)}</span>
                  <div className="flex flex-col">
                    <span className="text-sm">{s.topic}</span>
                    <span className="text-xs text-muted-foreground">{s.chat_id}</span>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] ${
                    s.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {s.is_active ? 'scheduled' : 'off'}
                </span>
              </Card>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
