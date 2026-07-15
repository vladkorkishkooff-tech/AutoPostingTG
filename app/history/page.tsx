'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import Image from 'next/image'
import { ShieldCheck, FileText } from 'lucide-react'
import { PageHeader, Skeleton, EmptyState } from '@/components/ui'
import { swrFetcher as fetcher, haptic } from '@/lib/client'

type Post = {
  id: number
  channel_id: number
  channel_title: string | null
  chat_id: string
  topic: string
  mode: string
  text: string
  image_url: string | null
  status: string
  published_at: string | null
}

type Channel = { id: number; title: string | null; chat_id: string; is_active: boolean }

function MiniStat({ label, value }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="num text-lg font-semibold text-foreground">{value}</span>
      <span className="text-center text-[10px] text-muted-foreground">{label}</span>
    </div>
  )
}

export default function HistoryPage() {
  const [channelId, setChannelId] = useState('')
  const [days, setDays] = useState('30')
  const postsUrl = useMemo(() => {
    const params = new URLSearchParams({ status: 'published', days, limit: '100' })
    if (channelId) params.set('channelId', channelId)
    return `/api/posts?${params.toString()}`
  }, [channelId, days])
  const { data, isLoading } = useSWR<{ posts: Post[] }>(postsUrl, fetcher)
  const { data: channelData } = useSWR<{ channels: Channel[] }>('/api/channels', fetcher)
  const posts = data?.posts ?? []

  const withImages = posts.filter((p) => p.image_url).length
  const topics = new Set(posts.map((p) => p.topic)).size

  return (
    <div>
      <PageHeader title="История" subtitle="Все опубликованные посты вашего канала" />

      <div className="fade-up flex flex-col gap-5 px-5 py-6">
        <div className="grid grid-cols-2 gap-2" aria-label="Фильтры истории">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">Канал</span>
            <select value={channelId} onChange={(event) => setChannelId(event.target.value)} className="glass px-3 py-2 text-xs outline-none">
              <option value="">Все каналы</option>
              {(channelData?.channels ?? []).map((channel) => (
                <option key={channel.id} value={channel.id}>{channel.title || channel.chat_id}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">Период</span>
            <select value={days} onChange={(event) => setDays(event.target.value)} className="glass px-3 py-2 text-xs outline-none">
              <option value="7">7 дней</option>
              <option value="30">30 дней</option>
              <option value="90">90 дней</option>
              <option value="365">Год</option>
            </select>
          </label>
        </div>
        {!isLoading && posts.length > 0 ? (
          <div className="glass grid grid-cols-4 gap-2 p-4">
            <MiniStat label="Всего постов" value={String(posts.length)} />
            <MiniStat label="С фото" value={String(withImages)} />
            <MiniStat label="Тем" value={String(topics)} />
            <MiniStat label="Повторов" value="0" accent />
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[88px] !rounded-xl" />
            <Skeleton className="h-[88px] !rounded-xl" />
            <Skeleton className="h-[88px] !rounded-xl" />
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<FileText size={18} aria-hidden="true" />}
            title="История пуста"
            description="Здесь появятся опубликованные посты — с текстом, фото и временем публикации."
            action={
              <Link
                href="/generator"
                onClick={() => haptic('light')}
                className="btn-green pressable px-5 py-2.5 text-[13px]"
              >
                Создать первый пост
              </Link>
            }
          />
        ) : (
          <section aria-label="Список публикаций" className="flex flex-col gap-3">
            {posts.map((post) => (
              <article key={post.id} className="glass flex gap-3.5 p-4">
                {post.image_url ? (
                  <Image
                    src={post.image_url || '/placeholder.svg'}
                    alt=""
                    width={56}
                    height={56}
                    unoptimized
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
                      <span className="max-w-24 truncate text-[11px] text-muted-foreground">{post.channel_title || post.chat_id}</span>
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
