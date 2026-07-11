'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Play, Trash2, Plus } from 'lucide-react'
import { PageHeader, Skeleton } from '@/components/ui'
import { BottomNav } from '@/components/bottom-nav'
import { apiFetch, haptic, swrFetcher } from '@/lib/client'

type Template = { id: number; title: string; topic: string; mode: string | null; created_at: string }

const MODES = [
  { id: '', label: 'Любой' },
  { id: 'normal', label: 'Обычный' },
  { id: 'funny', label: 'Смешной' },
  { id: 'wow', label: 'Wow' },
  { id: 'strict', label: 'Строгий' },
]

export default function TemplatesPage() {
  const router = useRouter()
  const { data, mutate } = useSWR<{ templates: Template[] }>('/api/templates', swrFetcher)
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [mode, setMode] = useState('')
  const [busy, setBusy] = useState(false)

  async function addTemplate() {
    if (!title.trim() || !topic.trim()) return
    haptic('medium')
    setBusy(true)
    try {
      const res = await apiFetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, topic, mode: mode || null }),
      })
      if (res.ok) {
        haptic('success')
        setTitle('')
        setTopic('')
        setMode('')
        mutate()
      } else {
        haptic('error')
      }
    } finally {
      setBusy(false)
    }
  }

  async function removeTemplate(id: number) {
    haptic('medium')
    await apiFetch(`/api/templates?id=${id}`, { method: 'DELETE' })
    mutate()
  }

  function applyTemplate(t: Template) {
    haptic('light')
    // Передаём тему и режим в генератор через query
    const params = new URLSearchParams({ topic: t.topic })
    if (t.mode) params.set('mode', t.mode)
    router.push(`/generator?${params.toString()}`)
  }

  return (
    <div className="flex min-h-dvh flex-col pb-20">
      <PageHeader title="Шаблоны постов" subtitle="Сохраните тему и режим — создавайте посты в два тапа" />

      <div className="fade-up flex flex-col gap-6 px-5 py-6">
        <section aria-label="Новый шаблон" className="glass flex flex-col gap-3 p-4">
          <p className="eyebrow">Новый шаблон</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            placeholder="Название (например: «Утренняя наука»)"
            className="rounded-lg border border-border bg-transparent px-3.5 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={120}
            placeholder="Тема (например: «космос и астрономия»)"
            className="rounded-lg border border-border bg-transparent px-3.5 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Режим шаблона">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  haptic('light')
                  setMode(m.id)
                }}
                aria-pressed={mode === m.id}
                className={`pressable rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  mode === m.id
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border bg-white/[0.03] text-muted-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || !title.trim() || !topic.trim()}
            onClick={addTemplate}
            className="btn-green pressable flex items-center justify-center gap-2 py-2.5 text-[13px] disabled:opacity-50"
          >
            <Plus size={14} aria-hidden="true" />
            {busy ? 'Сохранение…' : 'Сохранить шаблон'}
          </button>
        </section>

        <section aria-label="Сохранённые шаблоны">
          <p className="eyebrow mb-2.5 px-0.5">Сохранённые</p>
          {!data ? (
            <Skeleton className="h-[120px] w-full !rounded-xl" />
          ) : data.templates.length === 0 ? (
            <div className="ghost-card flex flex-col items-center gap-1.5 px-6 py-8 text-center">
              <p className="text-[13px] font-medium text-foreground">Шаблонов пока нет</p>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Сохраните связку «тема + режим» выше — и запускайте генерацию поста в два тапа
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.templates.map((t) => (
                <li key={t.id} className="glass flex items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">{t.title}</p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {t.topic}
                      {t.mode ? ` · ${MODES.find((m) => m.id === t.mode)?.label ?? t.mode}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => applyTemplate(t)}
                    aria-label={`Использовать шаблон ${t.title}`}
                    className="btn-blue pressable flex items-center gap-1.5 px-3 py-2 text-[12px]"
                  >
                    <Play size={12} aria-hidden="true" />
                    Создать
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTemplate(t.id)}
                    aria-label={`Удалить шаблон ${t.title}`}
                    className="pressable p-2 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <BottomNav />
    </div>
  )
}
