'use client'

import useSWR from 'swr'
import { ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { swrFetcher as fetcher } from '@/lib/client'

type Post = {
  id: number
  topic: string
  mode: string
  text: string
  image_url: string | null
  status: string
  published_at: string | null
}

function MiniStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`font-mono text-lg font-bold ${accent ? 'text-glow text-primary' : 'text-foreground'}`}>
        {value}
      </span>
      <span className="text-center text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
    </div>
  )
}

export default function HistoryPage() {
  const { data, isLoading } = useSWR<{ posts: Post[] }>('/api/posts?status=published', fetcher)
  const posts = data?.posts ?? []

  const withImages = posts.filter((p) => p.image_url).length
  const topics = new Set(posts.map((p) => p.topic)).size

  return (
    <div>
      <PageHeader title="История публикаций" />

      <div className="flex flex-col gap-4 p-4">
        <div className="glass grid grid-cols-4 gap-2 p-3">
          <MiniStat label="Всего постов" value={isLoading ? '—' : String(posts.length)} />
          <MiniStat label="С фото" value={isLoading ? '—' : String(withImages)} />
          <MiniStat label="Тем" value={isLoading ? '—' : String(topics)} />
          <MiniStat label="Повторов" value="0" accent />
        </div>

        {isLoading ? (
          <p className="px-1 text-sm text-muted-foreground">Загрузка…</p>
        ) : posts.length === 0 ? (
          <div className="glass flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-sm text-foreground">История пуста</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Здесь появятся опубликованные посты — с текстом, фото и временем публикации.
            </p>
          </div>
        ) : (
          <section aria-label="Список публикаций" className="flex flex-col gap-3">
            {posts.map((post) => (
              <article key={post.id} className="glass flex gap-3 p-3">
                {post.image_url ? (
                  <img
                    src={post.image_url || '/placeholder.svg'}
                    alt=""
                    className="size-16 shrink-0 rounded-xl border border-primary/20 object-cover"
                  />
                ) : (
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-[rgba(8,28,20,0.6)] text-[10px] text-muted-foreground">
                    txt
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p className="text-[13px] leading-snug text-foreground">{post.text}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span className="font-mono text-[10px]">
                        {post.published_at
                          ? new Date(post.published_at).toLocaleString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                      <span className="text-[10px] text-primary">{post.topic}</span>
                    </div>
                    <ShieldCheck size={15} className="shrink-0 text-primary" aria-hidden="true" />
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
