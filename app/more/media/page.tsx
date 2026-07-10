'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Search, ChevronRight, X } from 'lucide-react'
import { PageHeader } from '@/components/ui'

type Post = { id: number; topic: string; image_url: string | null; image_source: string | null }

const SOURCES = ['Pexels', 'Pixabay', 'NASA', 'Wikimedia']

import { swrFetcher as fetcher } from '@/lib/client'

export default function MediaPage() {
  const { data, isLoading } = useSWR<{ posts: Post[] }>('/api/posts?status=published', fetcher)
  const images = (data?.posts ?? [])
    .filter((p) => p.image_url)
    .map((p) => ({ id: p.id, url: p.image_url!, topic: p.topic }))

  const [selected, setSelected] = useState<{ id: number; url: string; topic: string } | null>(null)
  const [query, setQuery] = useState('')

  return (
    <div>
      <PageHeader title="Медиа лаборатория" />
      <div className="flex flex-col gap-4 p-4">
        <div className="flex gap-2 overflow-x-auto">
          {SOURCES.map((s, i) => (
            <span
              key={s}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs ${
                i === 0
                  ? 'btn-outline-green !border-primary/70 font-semibold !text-primary'
                  : 'glass text-muted-foreground'
              }`}
            >
              {s}
            </span>
          ))}
        </div>

        <div className="glass flex items-center gap-2 px-3.5 py-2.5">
          <Search size={15} className="text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск изображений…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Поиск изображений"
          />
        </div>

        {!isLoading && images.length === 0 ? (
          <div className="glass flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-sm text-foreground">Галерея пуста</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Здесь появятся изображения из опубликованных постов — бот подбирает их автоматически.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-4 gap-2">
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setSelected(img)}
              aria-pressed={selected?.id === img.id}
              className={`relative overflow-hidden rounded-xl border transition-all ${
                selected?.id === img.id
                  ? 'border-primary/70 ring-glow'
                  : 'border-primary/15'
              }`}
            >
              <img src={img.url || "/placeholder.svg"} alt={img.topic} className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>

        {selected ? (
          <div className="glass flex items-center gap-3 p-3">
            <div className="relative shrink-0">
              <img
                src={selected.url || "/placeholder.svg"}
                alt={selected.topic}
                className="size-14 rounded-lg border border-primary/30 object-cover"
              />
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Сбросить выбор"
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-background text-muted-foreground"
              >
                <X size={11} aria-hidden="true" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Выбрано изображение</p>
              <p className="truncate text-sm text-foreground">{selected.topic}</p>
            </div>
            <button type="button" className="btn-green flex items-center gap-1 px-4 py-2.5 text-xs">
              Использовать
              <ChevronRight size={13} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Поиск идёт по источникам в порядке приоритета. Недавние изображения исключаются
          автоматически, чтобы канал не повторялся.
        </p>
      </div>
    </div>
  )
}
