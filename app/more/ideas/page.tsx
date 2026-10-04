'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Lightbulb, ExternalLink, RefreshCw, ArrowRight } from 'lucide-react'
import { PageHeader, Card, StatusPill } from '@/components/ui'
import { apiFetch, haptic } from '@/lib/client'

type Idea = { title: string; url: string; publishedAt: string | null; source: string; angle: string; freshness: 'today' | 'week' }

export default function IdeasPage() {
  const router = useRouter()
  const [topic, setTopic] = useState('наука технологии космос')
  const [query, setQuery] = useState('наука технологии космос')
  const { data, error, isLoading, mutate } = useSWR<{ ideas: Idea[]; asOf: string; freshnessWindowDays: number }>(`/api/ideas?topic=${encodeURIComponent(query)}`, (url: string) => apiFetch(url).then((res) => { if (!res.ok) throw new Error('Не удалось получить идеи'); return res.json() }))

  function search() { const next = topic.trim().slice(0, 120); if (!next) return; haptic('light'); setQuery(next); mutate() }
  return <div className="flex min-h-dvh flex-col pb-20">
    <PageHeader title="Актуальные идеи" subtitle="Свежие темы из новостной ленты — отобраны за последние 7 дней" action={<button type="button" onClick={() => mutate()} aria-label="Обновить идеи" className="pressable rounded-lg border border-border p-2 text-muted-foreground"><RefreshCw size={15} className={isLoading ? 'animate-spin' : undefined} /></button>} />
    <div className="fade-up flex flex-col gap-4 px-5 py-6">
      <Card className="flex gap-2"><input value={topic} onChange={(event) => setTopic(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') search() }} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Например: космос, биология, ИИ" /><button type="button" onClick={search} className="btn-green px-3 py-2 text-xs">Найти</button></Card>
      {error ? <Card><p className="text-[12px] text-destructive">Не удалось загрузить идеи. Попробуйте ещё раз.</p></Card> : null}
      {isLoading && !data ? <Card><p className="text-[12px] text-muted-foreground">Собираю свежие источники…</p></Card> : null}
      <div className="flex flex-col gap-3">{data?.ideas?.map((idea) => <Card key={idea.url} className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-3"><p className="text-[14px] font-medium leading-snug">{idea.title}</p><StatusPill tone={idea.freshness === 'today' ? 'green' : 'blue'}>{idea.freshness === 'today' ? 'сегодня' : 'неделя'}</StatusPill></div>
        <p className="text-[12px] leading-relaxed text-muted-foreground">{idea.angle}</p>
        <div className="flex items-center justify-between gap-2"><a href={idea.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1 text-[11px] text-primary"><ExternalLink size={12} /> <span className="truncate">{idea.source}</span></a><button type="button" onClick={() => { haptic('light'); router.push(`/generator?topic=${encodeURIComponent(idea.title)}&mode=wow`) }} className="pressable flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">В генератор <ArrowRight size={12} /></button></div>
      </Card>)}</div>
      {data && data.ideas.length === 0 ? <Card className="flex flex-col items-center gap-2 py-8 text-center"><Lightbulb size={24} className="text-muted-foreground" /><p className="text-[12px] text-muted-foreground">Свежих материалов по запросу не найдено. Попробуйте более широкую тему.</p></Card> : null}
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">Идеи — это подсказки для редактора, а не автоматическая публикация. Откройте источник, проверьте факт и только затем добавляйте готовый пост в очередь.</p>
    </div>
  </div>
}
