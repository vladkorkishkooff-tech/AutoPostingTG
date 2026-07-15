'use client'

import { Suspense, useRef, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Eye, Send, Pencil, Check, ImageIcon, Sparkles, X, RefreshCw, History } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { apiFetch, haptic, swrFetcher } from '@/lib/client'

type HistoryItem = { id: number; topic: string; mode: string | null; text: string; created_at: string }
type Channel = {
  id: number
  chat_id: string
  title: string | null
  is_active: boolean
  is_verified?: boolean
  bot_can_post?: boolean
}
type PhotoCandidate = {
  url: string
  source: string
  title?: string
  query?: string
  requiredTerms?: string[]
}

const MODES = [
  { id: 'normal', label: 'Обычный' },
  { id: 'short', label: 'Коротко' },
  { id: 'long', label: 'Лонгрид' },
  { id: 'funny', label: 'Смешной' },
  { id: 'wow', label: 'Wow' },
  { id: 'strict', label: 'Строгий' },
]

function isVerifiedChannel(channel: Channel): boolean {
  return channel.is_verified === true && channel.bot_can_post === true
}

function assessDraft(text: string, mode: string): { ready: boolean; notes: string[] } {
  const notes: string[] = []
  const length = text.trim().length
  const minimum = mode === 'short' ? 70 : mode === 'long' ? 500 : 90
  const maximum = mode === 'short' ? 160 : mode === 'long' ? 1200 : 430
  if (length < minimum) notes.push(`Текст короче ${minimum} знаков для выбранного режима.`)
  if (length > maximum) notes.push(`Текст длиннее ${maximum} знаков для выбранного режима.`)
  if (!/^[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(text.trim())) {
    notes.push('В начале нет эмодзи, принятого в стиле канала.')
  }
  if (/https?:\/\/|www\./i.test(text)) notes.push('Найдена ссылка: проверьте, нужна ли она в посте.')
  if (/\*\*|__|```|^#{1,6}\s/m.test(text)) notes.push('Найдена Markdown-разметка, которая может выглядеть как обычные символы.')
  if (!/[.!?…]$/.test(text.trim())) notes.push('Последнее предложение не закончено.')
  return { ready: notes.length === 0, notes }
}

export default function GeneratorPage() {
  return (
    <Suspense fallback={<div className="px-5 py-8 text-sm text-muted-foreground">Загрузка генератора…</div>}>
      <GeneratorContent />
    </Suspense>
  )
}

function GeneratorContent() {
  const searchParams = useSearchParams()
  const templateTopic = searchParams.get('topic')?.slice(0, 120)
  const templateMode = searchParams.get('mode')
  const [topic, setTopic] = useState(templateTopic || 'Необычные языковые факты')
  const [mode, setMode] = useState(
    templateMode && MODES.some((item) => item.id === templateMode) ? templateMode : 'wow',
  )
  const [preview, setPreview] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<'preview' | 'publish' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [batchEnabled, setBatchEnabled] = useState(false)
  const [batchCount, setBatchCount] = useState(3)
  const [batchDrafts, setBatchDrafts] = useState<string[]>([])
  const [selectedBatch, setSelectedBatch] = useState<Set<number>>(() => new Set())
  const [batchSaving, setBatchSaving] = useState(false)
  // Фото: url (сток или data-URL от AI), source — подпись источника, query — запрос визуального редактора.
  const [photo, setPhoto] = useState<{
    url: string
    source: string
    query?: string
    requiredTerms?: string[]
  } | null>(null)
  const [photoStale, setPhotoStale] = useState(false)
  const [publicationFormat, setPublicationFormat] = useState<'text' | 'photo'>('text')
  const [photoBusy, setPhotoBusy] = useState<'stock' | 'ai' | null>(null)
  const [photoHint, setPhotoHint] = useState<string | null>(null)
  const [seenUrls, setSeenUrls] = useState<string[]>([])
  const [photoCandidates, setPhotoCandidates] = useState<PhotoCandidate[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const { data: historyData } = useSWR<{ history: HistoryItem[] }>(historyOpen ? '/api/history' : null, swrFetcher)
  const { data: channelsData } = useSWR<{ channels: Channel[] }>('/api/channels', swrFetcher)
  const activeChannels = (channelsData?.channels ?? []).filter(
    (channel) => channel.is_active && isVerifiedChannel(channel),
  )
  const [channelId, setChannelId] = useState<number | null>(null)
  const selectedChannelId = channelId ?? (activeChannels[0] ? Number(activeChannels[0].id) : null)
  const operationRef = useRef(false)

  function clearPhotoSelection() {
    setPhoto(null)
    setPhotoStale(false)
    setPublicationFormat('text')
    setPhotoHint(null)
    setSeenUrls([])
    setPhotoCandidates([])
  }

  function invalidatePreview() {
    setPreview(null)
    setBatchDrafts([])
    setSelectedBatch(new Set())
    setEditing(false)
    clearPhotoSelection()
  }

  async function run(action: 'preview' | 'publish') {
    if (operationRef.current) return
    operationRef.current = true
    haptic('medium')
    setBusy(action)
    setMessage(null)
    try {
      // Если текст предпросмотра есть — публикуем именно его (в т.ч. отредактированный)
      const isCustom = action === 'publish' && preview !== null
      const requestedCount = action === 'preview' && batchEnabled ? batchCount : 1
      const res = await apiFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isCustom
            ? {
                topic,
                mode,
                channelId: selectedChannelId,
                action: 'publish_custom',
                text: preview,
                imageMode: publicationFormat === 'photo' && photo && !photoStale ? 'auto' : 'off',
                ...(publicationFormat === 'photo' && photo && !photoStale ? { imageUrl: photo.url } : {}),
              }
            : {
                topic,
                mode,
                channelId: selectedChannelId,
                action,
                count: requestedCount,
                ...(action === 'preview'
                  ? { avoidTexts: [preview, ...batchDrafts].filter((value): value is string => Boolean(value)) }
                  : {}),
              },
        ),
      })
      const data = await res.json()
      if (!res.ok) {
        haptic('error')
        const partialPosts = Array.isArray(data.partialPosts)
          ? data.partialPosts.filter((item: unknown): item is string => typeof item === 'string')
          : []
        if (partialPosts.length > 0) {
          setBatchDrafts(partialPosts)
          setSelectedBatch(new Set())
        }
        setMessage(
          data.error === 'bot_unavailable'
            ? 'Бот недоступен. Проверьте, что он запущен.'
            : data.error === 'channel_not_found'
              ? 'Сначала добавьте активный канал.'
              : data.error === 'generation_incomplete'
                ? `Готово ${partialPosts.length} из ${requestedCount} черновиков. Можно сохранить их или повторить попытку.`
                : typeof data.details?.message === 'string'
                  ? data.details.message
                  : 'Ошибка генерации.',
        )
        return
      }
      haptic('success')
      if (action === 'preview') {
        if (requestedCount > 1) {
          const posts = Array.isArray(data.posts)
            ? data.posts.filter((item: unknown): item is string => typeof item === 'string')
            : []
          setBatchDrafts(posts)
          setSelectedBatch(new Set())
          setMessage(`Создано ${posts.length} черновиков. Выберите лучший для работы.`)
          return
        }
        const nextText = typeof data.text === 'string' ? data.text.trim() : ''
        if (!nextText) {
          setMessage('Бот вернул пустой черновик. Старый текст сохранён.')
          return
        }
        if (preview && preview !== nextText && photo) {
          setPhotoStale(true)
          setPublicationFormat('text')
          setPhotoHint('Текст изменился. Старое фото не будет опубликовано — подберите новое.')
        }
        setPreview(nextText)
        setEditing(false)
        setBatchDrafts([])
        setSelectedBatch(new Set())
        // Одиночный успешный черновик сразу попадает в историю.
        if (nextText) {
          apiFetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, mode, text: nextText }),
          }).catch(() => {})
        }
      } else {
        setMessage(`Пост опубликован в ${activeChannels.find((channel) => Number(channel.id) === selectedChannelId)?.title || activeChannels.find((channel) => Number(channel.id) === selectedChannelId)?.chat_id || 'канал'}.`)
        setPreview(null)
        setEditing(false)
        setPhoto(null)
        setPhotoStale(false)
        setPublicationFormat('text')
        setPhotoHint(null)
      }
    } catch {
      haptic('error')
      setMessage('Сетевая ошибка.')
    } finally {
      setBusy(null)
      operationRef.current = false
    }
  }

  async function fetchPhoto(kind: 'stock' | 'ai') {
    const currentText = preview?.trim()
    if (!currentText) {
      haptic('error')
      setPhotoHint('Сначала сгенерируйте текст поста, затем подберите фото именно к нему.')
      return
    }
    if (operationRef.current) return
    operationRef.current = true
    haptic('medium')
    setPhotoBusy(kind)
    setPhotoHint(null)
    try {
      const endpoint = kind === 'stock' ? '/api/image-search' : '/api/generate-image'
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(kind === 'ai' ? { action: kind } : { count: 3 }),
          topic,
          text: currentText,
          excludedUrls: [...seenUrls, ...photoCandidates.map((candidate) => candidate.url)],
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
          setPhotoHint(
            'Для этого конкретного факта нет проверенного стокового фото. Используйте «AI-фото» или измените текст — случайное общее изображение бот не подставит.',
          )
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
        setPhotoCandidates([])
        setPhotoStale(false)
        setPublicationFormat('photo')
      } else if (data.url && Array.isArray(data.candidates)) {
        const candidates: PhotoCandidate[] = (data.candidates as unknown[])
          .filter((candidate: unknown): candidate is PhotoCandidate => {
            if (!candidate || typeof candidate !== 'object') return false
            const value = candidate as Partial<PhotoCandidate>
            return typeof value.url === 'string' && typeof value.source === 'string'
          })
          .slice(0, 3)
        const selected = candidates[0] || data
        setPhotoCandidates(candidates)
        setPhoto({
          url: selected.url,
          source: selected.source || 'сток',
          query: selected.query || undefined,
          requiredTerms: Array.isArray(selected.requiredTerms) ? selected.requiredTerms : undefined,
        })
        setPhotoStale(false)
        setPublicationFormat('photo')
        setSeenUrls((prev) => [...prev.slice(-15), ...candidates.map((candidate) => candidate.url)])
      }
    } catch {
      haptic('error')
      setPhotoHint('Сетевая ошибка.')
    } finally {
      setPhotoBusy(null)
      operationRef.current = false
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
    if (next) {
      if (preview && preview !== next && photo) {
        setPhotoStale(true)
        setPublicationFormat('text')
        setPhotoHint('Текст изменился. Подберите фото заново, чтобы оно соответствовало посту.')
      }
      setPreview(next)
    }
    setEditing(false)
  }

  function openBatchDraft(index: number) {
    const text = batchDrafts[index]
    if (!text) return
    haptic('light')
    if (preview && preview !== text && photo) {
      setPhotoStale(true)
      setPublicationFormat('text')
      setPhotoHint('Выбран другой текст. Прежнее фото помечено как устаревшее.')
    }
    setPreview(text)
    setEditing(false)
    setMessage('Черновик открыт. Его можно отредактировать, добавить фото или опубликовать.')
  }

  function toggleBatchSelection(index: number) {
    setSelectedBatch((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function saveSelectedDrafts() {
    if (operationRef.current || selectedBatch.size === 0 || selectedChannelId === null) return
    operationRef.current = true
    setBatchSaving(true)
    setMessage(null)
    try {
      const response = await apiFetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: selectedChannelId,
          topic,
          mode,
          texts: [...selectedBatch].map((index) => batchDrafts[index]),
        }),
      })
      if (!response.ok) throw new Error('queue_save_failed')
      haptic('success')
      setMessage(`Добавлено в очередь: ${selectedBatch.size}.`)
      setSelectedBatch(new Set())
    } catch {
      haptic('error')
      setMessage('Не удалось добавить выбранные черновики в очередь.')
    } finally {
      setBatchSaving(false)
      operationRef.current = false
    }
  }

  const assessment = preview ? assessDraft(preview, mode) : null

  return (
    <div>
      <PageHeader title="Генератор" subtitle="Создайте пост вручную — с предпросмотром перед публикацией" />

      <div className="fade-up flex flex-col gap-6 px-5 py-6">
        <label className="flex flex-col gap-2">
          <span className="eyebrow">Канал публикации</span>
          <select
            value={selectedChannelId ?? ''}
            onChange={(event) => setChannelId(Number(event.target.value) || null)}
            className="glass px-4 py-3 text-sm outline-none focus:border-primary/60"
            aria-label="Канал публикации"
          >
            {activeChannels.length === 0 ? <option value="">Добавьте активный канал</option> : null}
            {activeChannels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.title || channel.chat_id}
              </option>
            ))}
          </select>
        </label>

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
            onChange={(e) => {
              setTopic(e.target.value)
              invalidatePreview()
            }}
            maxLength={120}
            placeholder="Необычные языковые факты"
            className="glass px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
        </label>

        <fieldset>
          <legend className="eyebrow mb-2.5">Режим</legend>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  haptic('light')
                  if (m.id !== mode) {
                    setMode(m.id)
                    invalidatePreview()
                  }
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

        <section className="glass flex flex-col gap-3 p-4" aria-label="Пакетная генерация">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-foreground">Пакетная генерация</span>
              <span className="text-[11px] leading-relaxed text-muted-foreground">
                Создаёт несколько разных черновиков. Автопубликации нет.
              </span>
            </span>
            <input
              type="checkbox"
              checked={batchEnabled}
              onChange={(event) => {
                setBatchEnabled(event.target.checked)
                setBatchDrafts([])
                setSelectedBatch(new Set())
              }}
              className="h-5 w-5 shrink-0 accent-primary"
              aria-label="Включить пакетную генерацию"
            />
          </label>
          {batchEnabled ? (
            <label className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-[12px] text-muted-foreground">Сколько черновиков</span>
              <select
                value={batchCount}
                onChange={(event) => setBatchCount(Number(event.target.value))}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
                aria-label="Число черновиков"
              >
                {[2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </section>

        {batchDrafts.length > 0 ? (
          <section className="flex flex-col gap-3" aria-label="Черновики пакета">
            <div className="flex items-center justify-between gap-3">
              <h2 className="eyebrow">Черновики пакета</h2>
              <span className="text-[11px] text-muted-foreground">готово {batchDrafts.length}</span>
            </div>
            <ul className="flex flex-col gap-2.5">
              {batchDrafts.map((text, index) => (
                <li key={`${index}-${text.slice(0, 24)}`} className="glass flex flex-col gap-3 p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedBatch.has(index)}
                      onChange={() => toggleBatchSelection(index)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                      aria-label={`Выбрать черновик ${index + 1}`}
                    />
                    <span className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{text}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => openBatchDraft(index)}
                    className="btn-outline-green pressable self-end px-3 py-1.5 text-[12px]"
                  >
                    Открыть для работы
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={selectedBatch.size === 0 || busy !== null || batchSaving}
              onClick={saveSelectedDrafts}
              className="btn-green pressable px-4 py-2.5 text-[13px] disabled:opacity-50"
            >
              {batchSaving
                ? 'Сохранение…'
                : `Добавить выбранные в очередь (${selectedBatch.size})`}
            </button>
          </section>
        ) : null}

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
                  <Image
                    src={photo.url || '/placeholder.svg'}
                    alt={`Фото для поста: ${topic}`}
                    width={800}
                    height={450}
                    unoptimized
                    className={`max-h-52 w-full object-cover ${photoStale ? 'opacity-40 grayscale' : ''}`}
                  />
                ) : null}
                <div className="flex flex-col gap-1.5 p-3.5">
                  <span className="text-[12.5px] font-semibold text-[#7a95e8]">
                    {activeChannels.find((channel) => Number(channel.id) === selectedChannelId)?.title ||
                      activeChannels.find((channel) => Number(channel.id) === selectedChannelId)?.chat_id ||
                      'Ваш канал'}
                  </span>
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
                  clearPhotoSelection()
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
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="sr-only">Формат публикации</legend>
              <label
                className={`pressable cursor-pointer rounded-lg border px-3 py-2.5 text-center text-[12px] ${
                  publicationFormat === 'text'
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="publication-format"
                  value="text"
                  checked={publicationFormat === 'text'}
                  onChange={() => setPublicationFormat('text')}
                  className="sr-only"
                />
                Только текст
              </label>
              <label
                className={`pressable rounded-lg border px-3 py-2.5 text-center text-[12px] ${
                  !photo || photoStale
                    ? 'cursor-not-allowed border-border text-muted-foreground opacity-50'
                    : publicationFormat === 'photo'
                      ? 'cursor-pointer border-primary/50 bg-primary/10 text-foreground'
                      : 'cursor-pointer border-border text-muted-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="publication-format"
                  value="photo"
                  checked={publicationFormat === 'photo'}
                  disabled={!photo || photoStale}
                  onChange={() => setPublicationFormat('photo')}
                  className="sr-only"
                />
                Текст + фото
              </label>
            </fieldset>
            {photoStale ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-200">
                Фото устарело после изменения текста и не будет прикреплено. Подберите стоковое или AI-фото заново.
              </p>
            ) : null}
            {photo ? (
              <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                <span>
                  {photoStale
                    ? `Источник: ${photo.source} — фото устарело и не будет опубликовано`
                    : publicationFormat === 'photo'
                      ? `Источник: ${photo.source} — фото будет прикреплено к посту`
                      : `Источник: ${photo.source} — выбран режим «Только текст»`}
                </span>
                {photo.query ? <span>Запрос нейросети: {photo.query}</span> : null}
                {photo.requiredTerms?.length ? (
                  <span>Обязательные признаки: {photo.requiredTerms.join(', ')}</span>
                ) : null}
              </div>
            ) : null}
            {photoCandidates.length > 1 ? (
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Варианты стокового фото">
                {photoCandidates.map((candidate) => (
                  <button
                    type="button"
                    key={candidate.url}
                    onClick={() => {
                      setPhoto({
                        url: candidate.url,
                        source: candidate.source,
                        query: candidate.query,
                        requiredTerms: candidate.requiredTerms,
                      })
                      setPhotoStale(false)
                      setPublicationFormat('photo')
                    }}
                    className={`overflow-hidden rounded-lg border text-left ${
                      photo?.url === candidate.url ? 'border-primary ring-1 ring-primary/40' : 'border-border'
                    }`}
                    aria-label={`Выбрать фото из ${candidate.source}`}
                  >
                    <Image
                      src={candidate.url}
                      alt={candidate.title || `Фото из ${candidate.source}`}
                      width={240}
                      height={135}
                      unoptimized
                      className="aspect-video w-full object-cover"
                    />
                    <span className="block truncate px-2 py-1 text-[10px] text-muted-foreground">
                      {candidate.source}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {photo && !preview ? (
              <Image
                src={photo.url || '/placeholder.svg'}
                alt={`Фото для поста: ${topic}`}
                width={800}
                height={450}
                unoptimized
                className={`max-h-56 w-full rounded-lg border border-border object-cover ${
                  photoStale ? 'opacity-40 grayscale' : ''
                }`}
              />
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={photoBusy !== null || busy !== null || !preview || editing}
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
                disabled={photoBusy !== null || busy !== null || !preview || editing}
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

        {assessment ? (
          <section
            className={`rounded-xl border p-4 ${
              assessment.ready ? 'border-primary/30 bg-primary/5' : 'border-amber-500/30 bg-amber-500/5'
            }`}
            aria-label="Проверка черновика"
          >
            <p className="text-[13px] font-medium text-foreground">
              {assessment.ready ? 'Формат поста готов' : 'Есть что проверить перед публикацией'}
            </p>
            {assessment.notes.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] leading-relaxed text-muted-foreground">
                {assessment.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Проверены длина и формат. Фактологию и соответствие фото нужно проверить в предпросмотре.
            </p>
          </section>
        ) : null}

        {message ? <p className="text-sm text-primary">{message}</p> : null}

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            disabled={busy !== null || photoBusy !== null || editing}
            onClick={() => run('preview')}
            className="btn-outline-green pressable flex items-center justify-center gap-2 px-4 py-3 text-sm disabled:opacity-50"
          >
            <Eye size={16} aria-hidden="true" />
            {busy === 'preview'
              ? batchEnabled
                ? `Генерация ${batchCount} черновиков…`
                : 'Генерация…'
              : batchEnabled
                ? `Сгенерировать ${batchCount} черновиков`
                : preview
                  ? 'Сгенерировать заново'
                  : 'Предпросмотр'}
          </button>
          <button
            type="button"
            disabled={
              busy !== null ||
              photoBusy !== null ||
              editing ||
              selectedChannelId === null ||
              (batchEnabled && !preview)
            }
            onClick={() => run('publish')}
            className="btn-blue pressable flex items-center justify-center gap-2 px-4 py-3 text-sm disabled:opacity-50"
          >
            <Send size={16} aria-hidden="true" />
            {busy === 'publish'
              ? 'Публикация…'
              : preview
                ? 'Опубликовать этот текст'
                : batchEnabled
                  ? 'Сначала выберите черновик'
                  : 'Опубликовать'}
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
                        if (preview && preview !== h.text && photo) {
                          setPhotoStale(true)
                          setPublicationFormat('text')
                          setPhotoHint('Выбран другой текст. Прежнее фото не будет опубликовано.')
                        }
                        setPreview(h.text)
                        setEditing(false)
                        setBatchDrafts([])
                        setSelectedBatch(new Set())
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
