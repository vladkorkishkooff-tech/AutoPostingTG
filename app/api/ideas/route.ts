import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

type Idea = { title: string; url: string; publishedAt: string | null; source: string; angle: string; freshness: 'today' | 'week' }

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim()
}

function tag(item: string, name: string): string {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return match ? decodeXml(match[1]) : ''
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const limited = await rateLimit(user.userId, 'ideas', 12)
    if (limited) return limited
    const { searchParams } = new URL(request.url)
    const topic = (searchParams.get('topic') ?? 'наука технологии космос').trim().slice(0, 120)
    if (!topic) return NextResponse.json({ error: 'topic_required' }, { status: 400 })
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=ru&gl=RU&ceid=RU:ru`
    const response = await fetch(rssUrl, { headers: { accept: 'application/rss+xml, application/xml;q=0.9' }, signal: AbortSignal.timeout(10_000), cache: 'no-store' })
    if (!response.ok) return NextResponse.json({ error: 'source_unavailable' }, { status: 502 })
    const xml = await response.text()
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1])
    const now = Date.now()
    const ideas: Idea[] = []
    for (const item of items) {
      const title = tag(item, 'title')
      const link = tag(item, 'link')
      const published = tag(item, 'pubDate')
      const publishedMs = Date.parse(published)
      if (!title || !/^https:\/\//i.test(link) || !Number.isFinite(publishedMs)) continue
      const ageDays = (now - publishedMs) / 86_400_000
      if (ageDays < -1 || ageDays > 7) continue
      const sourceMatch = title.match(/\s-\s([^\-]+)$/)
      const source = sourceMatch?.[1]?.trim() || 'Google News'
      ideas.push({
        title: title.replace(/\s-\s[^\-]+$/, '').trim(),
        url: link,
        publishedAt: new Date(publishedMs).toISOString(),
        source,
        angle: `Объяснить простыми словами, что произошло в теме «${topic}», почему это важно и что подтверждают источники.`,
        freshness: ageDays <= 1 ? 'today' : 'week',
      })
      if (ideas.length >= 12) break
    }
    return NextResponse.json({ topic, asOf: new Date().toISOString(), source: 'Google News RSS', freshnessWindowDays: 7, ideas })
  } catch (error) {
    console.error('[ideas] source failed', error)
    return NextResponse.json({ error: 'ideas_unavailable' }, { status: 502 })
  }
}
