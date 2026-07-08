'use client'

import useSWR from 'swr'
import { Card, PageHeader, StatusPill } from '@/components/ui'

type Post = { id: number; topic: string; image_url: string | null; image_source: string | null }

const SOURCES = ['Pexels', 'Pixabay', 'NASA', 'Wikimedia']

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function MediaPage() {
  const { data, isLoading } = useSWR<{ posts: Post[] }>('/api/posts?status=published', fetcher)
  const images = (data?.posts ?? []).filter((p) => p.image_url)

  return (
    <div>
      <PageHeader title="Медиа лаборатория" />
      <div className="flex flex-col gap-4 p-4">
        <div className="flex gap-2 overflow-x-auto">
          {SOURCES.map((s, i) => (
            <span
              key={s}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs ${
                i === 0 ? 'btn-neon font-semibold' : 'border-border text-muted-foreground'
              }`}
            >
              {s}
            </span>
          ))}
        </div>

        <section aria-label="Галерея изображений">
          <h2 className="mb-2 px-1 text-sm text-muted-foreground">Использованные изображения</h2>
          {isLoading ? (
            <Card>
              <p className="text-sm text-muted-foreground">Загрузка…</p>
            </Card>
          ) : images.length === 0 ? (
            <Card>
              <p className="text-sm text-muted-foreground">
                Пока нет изображений. Они появятся здесь после первых публикаций с фото.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {images.map((p) => (
                <figure key={p.id} className="relative overflow-hidden rounded-xl border border-primary/20">
                  <img src={p.image_url! || "/placeholder.svg"} alt={p.topic} className="aspect-square w-full object-cover" />
                  <figcaption className="absolute inset-x-0 bottom-0 bg-background/80 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground backdrop-blur">
                    {p.image_source ?? '—'}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>

        <Card className="flex items-center justify-between !p-3">
          <span className="text-sm text-muted-foreground">Дедупликация изображений</span>
          <StatusPill>активна</StatusPill>
        </Card>

        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Поиск идёт по источникам в порядке приоритета. Недавние изображения исключаются
          автоматически, чтобы канал не повторялся.
        </p>
      </div>
    </div>
  )
}
