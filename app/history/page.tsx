'use client'

import useSWR from 'swr'
import { ShieldCheck, SlidersHorizontal, Eye, Heart, MessageCircle } from 'lucide-react'
import { PageHeader } from '@/components/ui'

type Post = {
  id: number
  topic: string
  mode: string
  text: string
  image_url: string | null
  status: string
  published_at: string | null
}

import { swrFetcher as fetcher, apiFetch } from '@/lib/client'

const DEMO_POSTS = [
  { id: -1, text: 'В японском языке нет ругательств сильнее, чем «дурак» и «идиот»', when: 'Сегодня, 08:30', img: '/demo/japan.png', views: 26, likes: 3, comments: 3 },
  { id: -2, text: 'Сутки на Венере длятся дольше, чем год на Венере', when: 'Вчера, 19:00', img: '/demo/space.png', views: 42, likes: 5, comments: 1 },
  { id: -3, text: 'Белый медведь на самом деле черный', when: 'Вчера, 15:00', img: '/demo/bear.png', views: 31, likes: 2, comments: 0 },
  { id: -4, text: 'Кофе был открыт пастухом, заметившим бодрость коз', when: 'Вчера, 11:00', img: '/demo/coffee.png', views: 28, likes: 3, comments: 0 },
]

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
  const dbPosts = data?.posts ?? []

  const items =
    dbPosts.length > 0
      ? dbPosts.map((p) => ({
          id: p.id,
          text: p.text,
          when: p.published_at
            ? new Date(p.published_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
            : '',
          img: p.image_url,
          views: 0,
          likes: 0,
          comments: 0,
        }))
      : DEMO_POSTS

  return (
    <div>
      <PageHeader
        title="История публикаций"
        action={
          <button
            type="button"
            className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground"
          >
            <SlidersHorizontal size={13} aria-hidden="true" />
            Фильтры
          </button>
        }
      />

      <div className="flex flex-col gap-4 p-4">
        <div className="glass grid grid-cols-4 gap-2 p-3">
          <MiniStat label="Всего постов" value={isLoading ? '—' : dbPosts.length > 0 ? String(dbPosts.length) : '1 248'} />
          <MiniStat label="Просмотров" value="98.4K" />
          <MiniStat label="Реакций" value="12.7K" />
          <MiniStat label="Повторов" value="0" accent />
        </div>

        <section aria-label="Список публикаций" className="flex flex-col gap-3">
          {items.map((post) => (
            <article key={post.id} className="glass flex gap-3 p-3">
              {post.img ? (
                <img
                  src={post.img || "/placeholder.svg"}
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
                    <span className="font-mono text-[10px]">{post.when}</span>
                    <span className="flex items-center gap-1 font-mono text-[10px]">
                      <Eye size={11} aria-hidden="true" /> {post.views}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[10px]">
                      <Heart size={11} aria-hidden="true" /> {post.likes}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[10px]">
                      <MessageCircle size={11} aria-hidden="true" /> {post.comments}
                    </span>
                  </div>
                  <ShieldCheck size={15} className="shrink-0 text-primary" aria-hidden="true" />
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  )
}
