'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Image from 'next/image'
import { Search, X, ImageIcon } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/ui'
import { apiFetch, haptic, swrFetcher as fetcher } from '@/lib/client'

type Post = { id: number; topic: string; image_url: string | null; image_source: string | null }
type QueuedPost = { id: number; topic: string; channel_title: string | null; chat_id: string }
type Media = { id: number; url: string; topic: string; source: string }

export default function MediaPage() {
  const { data, isLoading } = useSWR<{ posts: Post[] }>('/api/posts?status=published&limit=100', fetcher)
  const { data: queueData, mutate: mutateQueue } = useSWR<{ posts: QueuedPost[] }>('/api/queue', fetcher)
  const images = useMemo<Media[]>(() => (data?.posts ?? [])
    .filter((post): post is Post & { image_url: string } => Boolean(post.image_url))
    .map((post) => ({ id: post.id, url: post.image_url, topic: post.topic, source: post.image_source || 'Без источника' })), [data])
  const sources = useMemo(() => ['Все', ...Array.from(new Set(images.map((image) => image.source)))], [images])
  const [source, setSource] = useState('Все')
  const [selected, setSelected] = useState<Media | null>(null)
  const [targetId, setTargetId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const filtered = images.filter((image) => (source === 'Все' || image.source === source) && image.topic.toLowerCase().includes(query.trim().toLowerCase()))

  async function useImage() {
    if (!selected || !targetId) return
    setBusy(true)
    setMessage('')
    try {
      const response = await apiFetch(`/api/queue/${targetId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: selected.url, mediaType: 'photo', imageSource: selected.source }),
      })
      if (!response.ok) throw new Error('attach_failed')
      setMessage('Фото добавлено к выбранному посту в очереди')
      haptic('success')
      await mutateQueue()
    } catch {
      setMessage('Не удалось добавить фото. Пост мог уже быть опубликован.')
      haptic('error')
    } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="Медиа" subtitle="Повторное использование фотографий из ваших публикаций" />
      <div className="fade-up flex flex-col gap-4 px-5 py-6">
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Источник изображения">
          {sources.map((item) => (
            <button key={item} type="button" aria-pressed={source === item} onClick={() => setSource(item)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium ${source === item ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}`}>
              {item}
            </button>
          ))}
        </div>

        <div className="glass flex items-center gap-2 px-3.5 py-2.5">
          <Search size={15} className="text-muted-foreground" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по теме поста…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" aria-label="Поиск изображений" />
        </div>

        {!isLoading && filtered.length === 0 ? <EmptyState icon={<ImageIcon size={18} aria-hidden="true" />} title={images.length ? 'Ничего не найдено' : 'Галерея пуста'} description={images.length ? 'Измените запрос или источник.' : 'Здесь появятся изображения после первой успешной публикации.'} /> : null}

        <div className="grid grid-cols-4 gap-2">
          {filtered.map((image) => (
            <button key={image.id} type="button" onClick={() => { setSelected(image); setMessage('') }} aria-pressed={selected?.id === image.id} className={`relative overflow-hidden rounded-lg border transition-colors ${selected?.id === image.id ? 'border-primary/70' : 'border-border'}`}>
              <Image src={image.url} alt={image.topic} width={180} height={180} unoptimized className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>

        {selected ? (
          <div className="glass flex flex-col gap-3 p-3">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <Image src={selected.url} alt={selected.topic} width={56} height={56} unoptimized className="size-14 rounded-lg border border-border object-cover" />
                <button type="button" onClick={() => setSelected(null)} aria-label="Сбросить выбор" className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-background text-muted-foreground"><X size={11} /></button>
              </div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm text-foreground">{selected.topic}</p><p className="text-xs text-muted-foreground">{selected.source}</p></div>
            </div>
            {(queueData?.posts ?? []).length ? (
              <div className="flex gap-2">
                <select value={targetId ?? ''} onChange={(event) => setTargetId(Number(event.target.value) || null)} className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2.5 text-xs outline-none" aria-label="Пост в очереди">
                  <option value="">Выберите пост в очереди</option>
                  {queueData!.posts.map((post) => <option key={post.id} value={post.id}>{post.topic} · {post.channel_title || post.chat_id}</option>)}
                </select>
                <button type="button" disabled={!targetId || busy} onClick={useImage} className="btn-green px-4 py-2.5 text-xs disabled:opacity-40">{busy ? 'Добавление…' : 'Использовать'}</button>
              </div>
            ) : <p className="text-xs text-muted-foreground">Чтобы использовать фото, сначала создайте пост в очереди.</p>}
            {message ? <p role="status" className="text-xs text-muted-foreground">{message}</p> : null}
          </div>
        ) : null}

        <p className="px-1 text-xs leading-relaxed text-muted-foreground">Фильтры работают по реальному источнику, сохранённому вместе с публикацией. Фото применяется только к выбранному посту в очереди.</p>
      </div>
    </div>
  )
}
