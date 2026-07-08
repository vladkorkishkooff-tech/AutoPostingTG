'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { PageHeader, StatusPill } from '@/components/ui'

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

const DEMO_SLOTS = [
  { time: '11:00', title: 'Почему кошки мурлыкают?', tag: 'Научные факты', status: 'scheduled' as const, img: '/demo/cat.png' },
  { time: '15:00', title: 'Интересный факт о пчелах', tag: 'Природа', status: 'ready' as const, img: '/demo/bee.png' },
  { time: '19:00', title: 'Зачем зебрам полосы?', tag: 'Животные', status: 'scheduled' as const, img: '/demo/zebra.png' },
  { time: '22:00', title: 'Хватило сна человеку', tag: 'Наука о человеке', status: 'scheduled' as const, img: '/demo/sleep.png' },
  { time: 'Завтра, 08:00', title: 'Почему небо голубое?', tag: 'Природа', status: 'posted' as const, img: '/demo/sky.png' },
]

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

  const dbSchedules = [...(data?.schedules ?? [])].sort((a, b) => a.post_time.localeCompare(b.post_time))
  const slots =
    dbSchedules.length > 0
      ? dbSchedules.map((s) => ({
          time: s.post_time.slice(0, 5),
          title: s.topic,
          tag: s.chat_id,
          status: (s.is_active ? 'scheduled' : 'posted') as 'scheduled' | 'ready' | 'posted',
          img: null as string | null,
        }))
      : DEMO_SLOTS

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
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs transition-all ${
                tab === i
                  ? 'btn-outline-green !border-primary/70 font-semibold !text-primary'
                  : 'glass text-muted-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ChevronLeft size={16} aria-hidden="true" />
            <ChevronRight size={16} aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-foreground">Сегодня, {today}</p>
          <span aria-hidden="true" className="w-8" />
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

        <section aria-label="Слоты расписания" className="relative flex flex-col gap-0">
          {slots.map((s, i) => (
            <div key={`${s.time}-${i}`} className="relative flex gap-3 pb-4">
              <div className="flex w-14 shrink-0 flex-col items-center">
                <span className="text-center font-mono text-[11px] leading-tight text-muted-foreground">{s.time}</span>
                <span
                  className="mt-1.5 size-2.5 rounded-full bg-primary"
                  style={{ boxShadow: '0 0 8px rgba(47,226,142,0.7)' }}
                  aria-hidden="true"
                />
                {i < slots.length - 1 ? (
                  <span className="mt-1 w-px flex-1 bg-primary/25" aria-hidden="true" />
                ) : null}
              </div>
              <div className="glass flex flex-1 items-center gap-3 p-2.5">
                {s.img ? (
                  <img src={s.img || "/placeholder.svg"} alt="" className="size-12 shrink-0 rounded-lg border border-primary/20 object-cover" />
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] text-foreground">{s.title}</span>
                  <span className="text-[11px] text-muted-foreground">{s.tag}</span>
                </div>
                <StatusPill tone={s.status === 'scheduled' ? 'green' : s.status === 'ready' ? 'yellow' : 'blue'}>
                  {s.status}
                </StatusPill>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
