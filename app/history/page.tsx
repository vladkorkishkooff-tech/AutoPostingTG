'use client'

import useSWR from 'swr'
import { ShieldCheck } from 'lucide-react'
import { PageHeader, Skeleton } from '@/components/ui'
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

function MiniStat({ label, value }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="num text-lg font-semibold text-foreground">{value}</span>
      <span className="text-center text-[10px] text-muted-foreground">{label}</span>
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

      <div className="fade-up flex flex-col gap-5 px-5 py-6">
        <div className="glass grid grid-cols-4 gap-2 p-4">
          <MiniStat label="Всего постов" value={isLoading ? '—' : String(posts.length)} />
          <MiniStat label="С фото" value={isLoading ? '—' : String(withImages)} />
          <MiniStat label="Тем" value={isLoading ? '—' : String(topics)} />
          <MiniStat label="Повторов" value="0" accent />
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[88px] !rounded-xl" />
            <Skeleton className="h-[88px] !rounded-xl" />
            <Skeleton className="h-[88px] !rounded-xl" />
          </div>
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
              <article key={post.id} className="glass flex gap-3.5 p-4">
                {post.image_url ? (
                  <img
                    src={post.image_url || '/placeholder.svg'}
                    alt=""
                    className="size-14 shrink-0 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-[10px] text-muted-foreground">
                    txt
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p className="text-[13px] leading-relaxed text-foreground">{post.text}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span className="text-[11px]">
                        {post.published_at
                          ? new Date(post.published_at).toLocaleString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                      <span className="text-[11px] text-primary">{post.topic}</span>
                    </div>
                    <ShieldCheck size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
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
