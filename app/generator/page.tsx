'use client'

import { useState } from 'react'
import { Eye, Send, ShieldCheck } from 'lucide-react'
import { Card, PageHeader } from '@/components/ui'

const MODES = [
  { id: 'normal', label: 'Обычный' },
  { id: 'funny', label: 'Смешной' },
  { id: 'wow', label: 'Wow' },
  { id: 'strict', label: 'Строгий' },
]

function qualityScore(text: string): number {
  let score = 55
  if (text.length > 60) score += 15
  if (text.length > 120) score += 10
  if (/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(text)) score += 7
  if (/\d/.test(text)) score += 5
  return Math.min(score, 98)
}

export default function GeneratorPage() {
  const [topic, setTopic] = useState('')
  const [mode, setMode] = useState('wow')
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preview' | 'publish' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function run(action: 'preview' | 'publish') {
    setBusy(action)
    setMessage(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, mode, action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error === 'bot_unavailable' ? 'Бот недоступен. Проверьте, что он запущен.' : 'Ошибка генерации.')
        return
      }
      if (action === 'preview') {
        setPreview(data.text ?? null)
      } else {
        setMessage('Пост опубликован в канал.')
      }
    } catch {
      setMessage('Сетевая ошибка.')
    } finally {
      setBusy(null)
    }
  }

  const score = preview ? qualityScore(preview) : null

  return (
    <div>
      <PageHeader title="AI Генератор поста" />

      <div className="flex flex-col gap-4 p-4">
        <label className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Тема</span>
            <span className="font-mono text-[11px] text-muted-foreground">{topic.length}/120</span>
          </div>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={120}
            placeholder="Необычные языковые факты"
            className="neon-card rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
        </label>

        <fieldset>
          <legend className="mb-2 text-sm text-muted-foreground">Режим</legend>
          <div className="grid grid-cols-4 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                aria-pressed={mode === m.id}
                className={`rounded-xl border px-2 py-2 text-xs transition-all ${
                  mode === m.id
                    ? 'btn-neon font-semibold'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>

        <section aria-label="Предпросмотр поста">
          <h2 className="mb-2 text-sm text-muted-foreground">Предпросмотр поста</h2>
          <Card>
            {preview ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm leading-relaxed">{preview}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-primary">{topic || 'Научные факты'}</span>
                  <ShieldCheck size={15} className="text-primary" aria-hidden="true" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Нажмите Preview, чтобы сгенерировать текст
              </p>
            )}
          </Card>
        </section>

        {score !== null ? (
          <div className="flex items-center gap-3 px-1">
            <span className="shrink-0 text-xs text-muted-foreground">Оценка качества</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label="Оценка качества">
              <div className="neon-glow h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
            </div>
            <span className="shrink-0 font-mono text-xs text-primary">{score}/100</span>
          </div>
        ) : null}

        {message ? <p className="text-sm text-primary">{message}</p> : null}

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('preview')}
            className="btn-neon flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
          >
            <Eye size={16} aria-hidden="true" />
            {busy === 'preview' ? 'Генерация…' : 'Preview'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('publish')}
            className="btn-blue flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
          >
            <Send size={16} aria-hidden="true" />
            {busy === 'publish' ? 'Публикация…' : 'Опубликовать'}
          </button>
        </div>
      </div>
    </div>
  )
}
