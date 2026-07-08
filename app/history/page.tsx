'use client'

import useSWR from 'swr'
import { Card, PageHeader, StatCard } from '@/components/ui'

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

export default function HistoryPage() {
  const { data, isLoading } = useSWR<{ posts: Post[] }>('/api/posts?status=published', fetcher)
  const posts = data?.posts ?? []

  return (
    <div>
      <PageHeader title="История публикаций" />

      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Всего постов" value={isLoading ? '—' : String(posts.length)} />
          <StatCard
            label="С изображением"
            value={isLoading ? '—' : String(posts.filter((p) => p.image_url).length)}
          />
        </div>

        <section aria-label="Список публикаций" className="flex flex-col gap-3">
          {!isLoading && posts.length === 0 ? (
            <Card>
              <p className="text-sm text-muted-foreground">Публикаций пока нет.</p>
            </Card>
          ) : (
            posts.map((post) => (
              <Card key={post.id} className="flex flex-col gap-2">
                <p className="text-sm leading-relaxed">{post.text}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="text-primary">{post.topic}</span>
                  {post.published_at ? (
                    <time dateTime={post.published_at}>
                      {new Date(post.published_at).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  ) : null}
                </div>
              </Card>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
