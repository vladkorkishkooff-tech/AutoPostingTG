'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Image from 'next/image'
import { Inbox, Check, X, Pencil, ImageIcon, Link2, RefreshCw } from 'lucide-react'
import { PageHeader, Skeleton, StatusPill } from '@/components/ui'
import { BottomNav } from '@/components/bottom-nav'
import { swrFetcher as fetcher, apiFetch, haptic } from '@/lib/client'

type QueuedPost = {
  id: number
  channel_id: number
  topic: string
  mode: string
  text: string
  image_url: string | null
  image_source: string | null
  media_type: string | null
  status: string
  scheduled_at: string | null
  channel_title: string | null
  chat_id: string
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'без времени'
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function MediaEditor({
  post,
  onSaved,
}: {
  post: QueuedPost
  onSaved: () => void
}) {
  const [url, setUrl] = useState(post.image_url ?? '')
  const [mediaType, setMediaType] = useState<'photo' | 'video'>(post.media_type === 'video' ? 'video' : 'photo')
  const [busy, setBusy] = useState<string | null>(null)

  async function save(imageUrl: string | null, type?: 'photo' | 'video', source?: string) {
    setBusy('save')
    try {
      await apiFetch(`/api/queue/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, mediaType: type, imageSource: source }),
      })
      haptic('success')
      onSaved()
    } finally {
      setBusy(null)
    }
  }

  async function pickStock() {
    haptic('medium')
    setBusy('stock')
    try {
      const res = await apiFetch('/api/image-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: post.topic, excludedUrls: post.image_url ? [post.image_url] : [] }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.url) {
          setUrl(data.url)
          setMediaType('photo')
          await save(data.url, 'photo', data.source)
          return
        }
      }
      haptic('error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-2.5 border-t border-border pt-3">
      <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Медиа</span>
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL своего фото или видео"
          aria-label="URL медиафайла"
          className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-[12px] outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
        />
        <div className="flex rounded-lg border border-border" role="radiogroup" aria-label="Тип медиа">
          {(['photo', 'video'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={mediaType === t}
              onClick={() => setMediaType(t)}
              className={`px-2.5 py-2 text-[11px] font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                mediaType === t ? 'bg-primary/15 text-foreground' : 'text-muted-foreground'
              }`}
            >
              {t === 'photo' ? 'Фото' : 'Видео'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => save(url.trim() || null, mediaType, 'custom')}
          disabled={busy !== null}
          className="btn-outline-green pressable flex items-center gap-1.5 px-3 py-2 text-[12px] disabled:opacity-50"
        >
          <Link2 size={13} aria-hidden="true" />
          {busy === 'save' ? 'Сохранение…' : 'Сохранить URL'}
        </button>
        <button
          type="button"
          onClick={pickStock}
          disabled={busy !== null}
          className="btn-outline-green pressable flex items-center gap-1.5 px-3 py-2 text-[12px] disabled:opacity-50"
        >
          <RefreshCw size={13} aria-hidden="true" className={busy === 'stock' ? 'animate-spin' : undefined} />
          Подобрать фото
        </button>
        {post.image_url ? (
          <button
            type="button"
            onClick={() => {
              setUrl('')
              save(null)
            }}
            disabled={busy !== null}
            className="pressable flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] text-muted-foreground disabled:opacity-50"
          >
            <X size={13} aria-hidden="true" />
            Убрать медиа
          </button>
        ) : null}
      </div>
    </div>
  )
}

function QueueCard({ post, onChanged }: { post: QueuedPost; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [showMedia, setShowMedia] = useState(false)
  const [text, setText] = useState(post.text)
  const [busy, setBusy] = useState<string | null>(null)

  async function act(action: 'approve' | 'reject') {
    haptic(action === 'approve' ? 'success' : 'medium')
    setBusy(action)
    try {
      await apiFetch(`/api/queue/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  async function saveText() {
    haptic('medium')
    setBusy('text')
    try {
      await apiFetch(`/api/queue/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      haptic('success')
      setEditing(false)
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const isAiPending = post.image_source === 'ai_pending'

  return (
    <article className="glass flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium text-foreground">
            {post.topic}
            <span className="text-muted-foreground"> · {formatWhen(post.scheduled_at)}</span>
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {post.channel_title || post.chat_id}
          </span>
        </div>
        <StatusPill tone={post.status === 'approved' ? 'green' : 'blue'}>
          {post.status === 'approved' ? 'одобрен' : 'на проверке'}
        </StatusPill>
      </div>

      {post.image_url && post.media_type !== 'video' ? (
        <div className="relative h-40 overflow-hidden rounded-lg border border-border">
          <Image
            src={post.image_url || '/placeholder.svg'}
            alt={`Изображение к посту: ${post.topic}`}
            fill
            sizes="(max-width: 448px) 100vw, 448px"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : isAiPending ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2.5">
          <ImageIcon size={14} className="text-muted-foreground" aria-hidden="true" />
          <span className="text-[12px] text-muted-foreground">
            AI-изображение будет сгенерировано при публикации
          </span>
        </div>
      ) : null}

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            aria-label="Текст поста"
            className="rounded-lg border border-border bg-muted px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-primary/50"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveText}
              disabled={busy !== null || !text.trim()}
              className="btn-blue pressable flex-1 px-3 py-2 text-[12px] disabled:opacity-50"
            >
              {busy === 'text' ? 'Сохранение…' : 'Сохранить текст'}
            </button>
            <button
              type="button"
              onClick={() => {
                setText(post.text)
                setEditing(false)
              }}
              className="pressable rounded-lg border border-border px-3 py-2 text-[12px] text-muted-foreground"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">{post.text}</p>
      )}

      {showMedia ? <MediaEditor post={post} onSaved={onChanged} /> : null}

      <div className="flex items-center gap-2 border-t border-border pt-3">
        {post.status !== 'approved' ? (
          <button
            type="button"
            onClick={() => act('approve')}
            disabled={busy !== null}
            className="btn-green pressable flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] disabled:opacity-50"
          >
            <Check size={15} aria-hidden="true" />
            Одобрить
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            haptic('light')
            setEditing((v) => !v)
          }}
          aria-label="Редактировать текст"
          className="btn-outline-green pressable flex items-center justify-center p-2.5"
        >
          <Pencil size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            haptic('light')
            setShowMedia((v) => !v)
          }}
          aria-label="Изменить медиа"
          aria-expanded={showMedia}
          className="btn-outline-green pressable flex items-center justify-center p-2.5"
        >
          <ImageIcon size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => act('reject')}
          disabled={busy !== null}
          aria-label="Отклонить пост"
          className="pressable flex items-center justify-center rounded-lg border border-border p-2.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

export default function QueuePage() {
  const { data, mutate, isLoading } = useSWR<{ posts: QueuedPost[] }>('/api/queue', fetcher, {
    refreshInterval: 30_000,
  })
  const posts = data?.posts ?? []

  return (
    <div className="pb-24">
      <PageHeader
        title="Очередь"
        subtitle="Посты, подготовленные к публикации — проверьте и одобрите"
      />

      <div className="fade-up flex flex-col gap-4 px-5 py-6">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[180px] !rounded-xl" />
            <Skeleton className="h-[180px] !rounded-xl" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="eyebrow px-0.5">Как это работает</p>
            <div className="ghost-card flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="h-2.5 w-32 rounded bg-white/[0.07]" aria-hidden="true" />
                  <span className="h-2 w-20 rounded bg-white/[0.05]" aria-hidden="true" />
                </div>
                <span className="pill-scheduled rounded-full px-2.5 py-1 text-[11px] opacity-60">на проверке</span>
              </div>
              <div className="flex flex-col gap-1.5" aria-hidden="true">
                <span className="h-2 w-full rounded bg-white/[0.05]" />
                <span className="h-2 w-full rounded bg-white/[0.05]" />
                <span className="h-2 w-2/3 rounded bg-white/[0.05]" />
              </div>
              <div className="flex items-center gap-2 border-t border-border pt-3" aria-hidden="true">
                <span className="h-8 flex-1 rounded-lg bg-white/[0.05]" />
                <span className="size-8 rounded-lg bg-white/[0.04]" />
                <span className="size-8 rounded-lg bg-white/[0.04]" />
              </div>
            </div>
            <div className="flex items-start gap-2.5 px-0.5">
              <Inbox size={15} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                Бот готовит посты заранее — за час до времени публикации. Подготовленный пост появится здесь в таком виде: вы сможете отредактировать текст, заменить фото и одобрить его до отправки в канал.
              </p>
            </div>
          </div>
        ) : (
          posts.map((p) => <QueueCard key={p.id} post={p} onChanged={() => mutate()} />)
        )}
      </div>

      <BottomNav />
    </div>
  )
}
