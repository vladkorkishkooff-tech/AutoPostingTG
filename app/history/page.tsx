'use client'

import useSWR from 'swr'
import { ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { Card, PageHeader } from '@/components/ui'

type Post = {
  id: number
  topic: string
  mode: string
  text: string
  image_url: string | null
  status: string
  published_at: string | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function MiniStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`font-mono text-lg font-semibold ${accent ? 'neon-text text-primary' : ''}`}>{value}</span>
      <span className="text-center text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>
    </div>
  )
}

export default function HistoryPage() {
  const { data, isLoading } = useSWR<{ posts: Post[] }>('/api/posts?status=published', fetcher)
  const posts = data?.posts ?? []

  return (
    <div>
      <PageHeader
        title="История публикаций"
        action={
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
          >
            <SlidersHorizontal size={13} aria-hidden="true" />
            Фильтры
          </button>
        }
      />

      <div className="flex flex-col gap-4 p-4">
        <Card className="grid grid-cols-4 gap-2 !p-3">
          <MiniStat label="Всего постов" value={isLoading ? '—' : String(posts.length)} />
          <MiniStat
            label="С фото"
            value={isLoading ? '—' : String(posts.filter((p) => p.image_url).length)}
          />
          <MiniStat
            label="Тем"
            value={isLoading ? '—' : String(new Set(posts.map((p) => p.topic)).size)}
          />
          <MiniStat label="Повторов" value="0" accent />
        </Card>

        <section aria-label="Список публикаций" className="flex flex-col gap-3">
          {!isLoading && posts.length === 0 ? (
            <Card>
              <p className="text-sm text-muted-foreground">Публикаций пока нет.</p>
            </Card>
          ) : (
            posts.map((post) => (
              <Card key={post.id} className="flex gap-3 !p-3">
                {post.image_url ? (
                  <img
                    src={post.image_url || "/placeholder.svg"}
                    alt=""
                    className="size-16 shrink-0 rounded-xl border border-primary/20 object-cover"
                  />
                ) : (
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-[10px] text-muted-foreground">
                    txt
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-1.5">
                  <p className="text-sm leading-snug">{post.text}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {post.published_at
                        ? new Date(post.published_at).toLocaleString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                    <ShieldCheck size={15} className="text-primary" aria-hidden="true" />
                  </div>
                </div>
              </Card>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
