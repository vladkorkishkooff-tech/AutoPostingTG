'use client'

import { useState } from 'react'
import { Eye, Send } from 'lucide-react'
import { Card, PageHeader } from '@/components/ui'

const MODES = [
  { id: 'normal', label: 'Обычный' },
  { id: 'funny', label: 'Смешной' },
  { id: 'wow', label: 'Wow' },
  { id: 'strict', label: 'Строгий' },
]

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

  return (
    <div>
      <PageHeader title="AI Генератор поста" />

      <div className="flex flex-col gap-4 p-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Тема</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={120}
            placeholder="Необычные языковые факты"
            className="rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
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
                className={`rounded-xl border px-2 py-2 text-xs transition-colors ${
                  mode === m.id
                    ? 'border-primary bg-primary/10 text-primary'
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
              <p className="text-sm leading-relaxed">{preview}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Нажмите Preview, чтобы сгенерировать текст
              </p>
            )}
          </Card>
        </section>

        {message ? <p className="text-sm text-primary">{message}</p> : null}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('preview')}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Eye size={16} aria-hidden="true" />
            {busy === 'preview' ? 'Генерация…' : 'Preview'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('publish')}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            <Send size={16} aria-hidden="true" />
            {busy === 'publish' ? 'Публикация…' : 'Опубликовать'}
          </button>
        </div>
      </div>
    </div>
  )
}
