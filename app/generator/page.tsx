'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Eye, Send, Pencil, Check, ImageIcon, Sparkles, X, RefreshCw, History } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { apiFetch, haptic, swrFetcher } from '@/lib/client'

type HistoryItem = { id: number; topic: string; mode: string | null; text: string; created_at: string }

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
  const [topic, setTopic] = useState('Необычные языковые факты')
  const [mode, setMode] = useState('wow')
  const [preview, setPreview] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<'preview' | 'publish' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // Фото: url (сток или data-URL от AI), source — подпись источника
  const [photo, setPhoto] = useState<{ url: string; source: string } | null>(null)
  const [photoBusy, setPhotoBusy] = useState<'stock' | 'ai' | null>(null)
  const [photoHint, setPhotoHint] = useState<string | null>(null)
  const [seenUrls, setSeenUrls] = useState<string[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const { data: historyData } = useSWR<{ history: HistoryItem[] }>(historyOpen ? '/api/history' : null, swrFetcher)

  // Тема и режим из шаблона (переход из «Ещё» → «Шаблоны постов»)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const qTopic = params.get('topic')
    const qMode = params.get('mode')
    if (qTopic) setTopic(qTopic.slice(0, 120))
    if (qMode && MODES.some((m) => m.id === qMode)) setMode(qMode)
  }, [])

  async function run(action: 'preview' | 'publish') {
    haptic('medium')
    setBusy(action)
    setMessage(null)
    try {
      // Если текст предпросмотра есть — публикуем именно его (в т.ч. отредактированный)
      const isCustom = action === 'publish' && preview !== null
      const res = await apiFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isCustom
            ? {
                topic,
                mode,
                action: 'publish_custom',
                text: preview,
                ...(photo ? { imageUrl: photo.url } : {}),
              }
            : { topic, mode, action },
        ),
      })
      const data = await res.json()
      if (!res.ok) {
        haptic('error')
        setMessage(data.error === 'bot_unavailable' ? 'Бот недоступен. Проверьте, что он запущен.' : 'Ошибка генерации.')
        return
      }
      haptic('success')
      if (action === 'preview') {
        setPreview(data.text ?? null)
        setEditing(false)
        // Сохраняем в историю генераций (fire-and-forget)
        if (data.text) {
          apiFetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, mode, text: data.text }),
          }).catch(() => {})
        }
      } else {
        setMessage('Пост опубликован в канал.')
        setPreview(null)
        setEditing(false)
        setPhoto(null)
        setPhotoHint(null)
      }
    } catch {
      haptic('error')
      setMessage('Сетевая ошибка.')
    } finally {
      setBusy(null)
    }
  }

  async function fetchPhoto(kind: 'stock' | 'ai') {
    haptic('medium')
    setPhotoBusy(kind)
    setPhotoHint(null)
    try {
      const res = await apiFetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: kind,
          topic,
          text: preview ?? '',
          excludedUrls: seenUrls,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        haptic('error')
        if (data.error === 'no_key') {
          setPhotoHint(
            'Для AI-генерации фото нужен ключ Google Gemini. Добавьте GEMINI_API_KEY в .env бота или ключ Gemini в разделе «Ещё» → «API-ключи» — и перезапустите бота.',
          )
        } else if (data.error === 'image_not_found') {
          setPhotoHint('Не нашлось подходящего фото по этой теме. Попробуйте уточнить тему.')
        } else if (data.error === 'bot_unavailable') {
          setPhotoHint('Бот недоступен. Проверьте, что он запущен.')
        } else {
          setPhotoHint('Не удалось получить фото. Попробуйте ещё раз.')
        }
        return
      }
      haptic('success')
      if (kind === 'ai' && data.dataUrl) {
        setPhoto({ url: data.dataUrl, source: 'AI (Gemini)' })
      } else if (data.url) {
        setPhoto({ url: data.url, source: data.source || 'сток' })
        setSeenUrls((prev) => [...prev.slice(-15), data.url])
      }
    } catch {
      haptic('error')
      setPhotoHint('Сетевая ошибка.')
    } finally {
      setPhotoBusy(null)
    }
  }

  function startEditing() {
    haptic('light')
    setDraft(preview ?? '')
    setEditing(true)
  }

  function applyEdit() {
    haptic('light')
    const next = draft.trim()
    if (next) setPreview(next)
    setEditing(false)
  }

  const score = preview ? qualityScore(preview) : 0

  return (
    <div>
      <PageHeader title="Генератор" subtitle="Создайте пост вручную — с предпросмотром перед публикацией" />

      <div className="fade-up flex flex-col gap-6 px-5 py-6">
        <label className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Тема</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  haptic('light')
                  setHistoryOpen(true)
                }}
                className="pressable flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
              >
                <History size={13} aria-hidden="true" />
                История
              </button>
              <span className="num text-[11px] text-muted-foreground">{topic.length}/120</span>
            </div>
          </div>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={120}
            placeholder="Необычные языковые факты"
            className="glass px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
        </label>

        <fieldset>
          <legend className="eyebrow mb-2.5">Режим</legend>
          <div className="grid grid-cols-4 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  haptic('light')
                  setMode(m.id)
                }}
                aria-pressed={mode === m.id}
                className={`pressable rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                  mode === m.id
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'glass border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>

        <section aria-label="Предпросмотр поста">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="eyebrow">Так пост увидят подписчики</p>
            {preview && !editing ? (
              <button
                type="button"
                onClick={startEditing}
                className="pressable flex items-center gap-1.5 text-[12px] font-medium text-primary"
              >
                <Pencil size={13} aria-hidden="true" />
                Редактировать
              </button>
            ) : null}
          </div>

          {editing ? (
            <div className="glass flex flex-col gap-2 p-4">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                maxLength={2000}
                aria-label="Текст поста"
                className="w-full resize-y rounded-lg border border-primary/40 bg-transparent p-3 text-[13px] leading-relaxed text-foreground outline-none focus:border-primary/70"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{draft.length}/2000</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light')
                      setEditing(false)
                    }}
                    className="pressable rounded-lg px-3 py-1.5 text-[12px] text-muted-foreground"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={applyEdit}
                    disabled={!draft.trim()}
                    className="btn-green pressable flex items-center gap-1.5 px-3 py-1.5 text-[12px] disabled:opacity-50"
                  >
                    <Check size={13} aria-hidden="true" />
                    Готово
                  </button>
                </div>
              </div>
            </div>
          ) : preview ? (
            <div className="flex gap-2.5">
              <span className="tg-avatar mt-0.5" aria-hidden="true">
                {(topic || 'К').trim().charAt(0).toUpperCase()}
              </span>
              <div className="tg-post min-w-0 flex-1 overflow-hidden">
                {photo ? (
                  <img
                    src={photo.url || '/placeholder.svg'}
                    alt={`Фото для поста: ${topic}`}
                    className="max-h-52 w-full object-cover"
                  />
                ) : null}
                <div className="flex flex-col gap-1.5 p-3.5">
                  <span className="text-[12.5px] font-semibold text-[#7a95e8]">Ваш канал</span>
                  <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#e8ecf2]">{preview}</p>
                  <div className="mt-0.5 flex items-center justify-end gap-1.5">
                    <Eye size={11} className="text-[#6d7a8c]" aria-hidden="true" />
                    <span className="num text-[11px] text-[#6d7a8c]">1.2K</span>
                    <span className="num text-[11px] text-[#6d7a8c]">
                      {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="ghost-card flex flex-col items-center gap-1.5 px-6 py-8 text-center">
              <p className="text-[13px] font-medium text-foreground">Здесь появится ваш пост</p>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Нажмите «Предпросмотр» — текст сгенерируется и отобразится так, как его увидят подписчики канала
              </p>
            </div>
          )}
        </section>

        <section aria-label="Фото поста">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="eyebrow">Фото поста</h2>
            {photo ? (
              <button
                type="button"
                onClick={() => {
                  haptic('light')
                  setPhoto(null)
                  setPhotoHint(null)
                }}
                className="pressable flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
              >
                <X size={13} aria-hidden="true" />
                Убрать
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground">без выбора — по настройкам канала</span>
            )}
          </div>

          <div className="glass flex flex-col gap-3 p-4">
            {photo ? (
              <span className="text-[11px] text-muted-foreground">
                {preview
                  ? `Источник: ${photo.source} — фото показан�� в предпросмотре выше и будет прикреплено к посту`
                  : `Источник: ${photo.source} — нажмите «Предпросмотр»: фото прикрепится к сгенерированному тексту`}
              </span>
            ) : null}
            {photo && !preview ? (
              <img
                src={photo.url || '/placeholder.svg'}
                alt={`Фото для поста: ${topic}`}
                className="max-h-56 w-full rounded-lg border border-border object-cover"
              />
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={photoBusy !== null}
                onClick={() => fetchPhoto('stock')}
                className="btn-outline-green pressable flex items-center justify-center gap-2 px-3 py-2.5 text-[13px] disabled:opacity-50"
              >
                {photo && photoBusy !== 'ai' ? (
                  <RefreshCw size={14} className={photoBusy === 'stock' ? 'animate-spin' : ''} aria-hidden="true" />
                ) : (
                  <ImageIcon size={14} aria-hidden="true" />
                )}
                {photoBusy === 'stock' ? 'Поиск…' : photo ? 'Другое фото' : 'Стоковое фото'}
              </button>
              <button
                type="button"
                disabled={photoBusy !== null}
                onClick={() => fetchPhoto('ai')}
                className="btn-blue pressable flex items-center justify-center gap-2 px-3 py-2.5 text-[13px] disabled:opacity-50"
              >
                <Sparkles size={14} className={photoBusy === 'ai' ? 'animate-pulse' : ''} aria-hidden="true" />
                {photoBusy === 'ai' ? 'Генерация…' : 'AI-фото'}
              </button>
            </div>

            {photoHint ? (
              <p className="rounded-lg border border-border bg-white/[0.03] p-3 text-[12px] leading-relaxed text-muted-foreground">
                {photoHint}
              </p>
            ) : null}
          </div>
        </section>

        {preview ? (
          <div className="flex items-center gap-3 px-1">
            <span className="shrink-0 text-xs text-muted-foreground">Оценка качества</span>
            <div
              className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={score}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Оценка качества"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{score}/100</span>
          </div>
        ) : null}

        {message ? <p className="text-sm text-primary">{message}</p> : null}

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('preview')}
            className="btn-outline-green pressable flex items-center justify-center gap-2 px-4 py-3 text-sm disabled:opacity-50"
          >
            <Eye size={16} aria-hidden="true" />
            {busy === 'preview' ? 'Генерация…' : preview ? 'Сгенерировать заново' : 'Предпросмотр'}
          </button>
          <button
            type="button"
            disabled={busy !== null || editing}
            onClick={() => run('publish')}
            className="btn-blue pressable flex items-center justify-center gap-2 px-4 py-3 text-sm disabled:opacity-50"
          >
            <Send size={16} aria-hidden="true" />
            {busy === 'publish' ? 'Публикация…' : preview ? 'Опубликовать этот текст' : 'Опубликовать'}
          </button>
        </div>
      </div>

      {historyOpen ? (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="История генераций"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-border bg-background p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="eyebrow">История генераций</h2>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Закрыть"
                className="pressable text-muted-foreground hover:text-foreground"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {!historyData ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">Загрузка…</p>
            ) : historyData.history.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">
                Пока пусто — сгенерируйте первый пост, и он появится здесь
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {historyData.history.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light')
                        setTopic(h.topic)
                        if (h.mode) setMode(h.mode)
                        setPreview(h.text)
                        setEditing(false)
                        setHistoryOpen(false)
                      }}
                      className="glass pressable flex w-full flex-col gap-1.5 p-3.5 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] font-medium text-primary">{h.topic}</span>
                        <time className="num shrink-0 text-[11px] text-muted-foreground" dateTime={h.created_at}>
                          {new Date(h.created_at).toLocaleString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </div>
                      <p className="line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">{h.text}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
