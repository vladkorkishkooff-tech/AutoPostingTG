import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Вычисляет ближайший слот публикации по расписаниям (weekday: 0=Пн, как в Python). */
function computeNextSlot(
  schedules: { post_time: string; days_of_week: number[] | null; timezone: string | null }[],
): string | null {
  let best: Date | null = null
  const now = new Date()

  for (const s of schedules) {
    const tz = s.timezone || 'Europe/Moscow'
    const [hh, mm] = String(s.post_time).slice(0, 5).split(':').map(Number)
    if (Number.isNaN(hh) || Number.isNaN(mm)) continue

    for (let offset = 0; offset < 8; offset++) {
      const candidate = new Date(now.getTime() + offset * 86400000)
      // Локальные дата и день недели в таймзоне слота
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(candidate)
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
      const weekdayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
      const pyWeekday = weekdayMap[get('weekday')]
      const days = s.days_of_week && s.days_of_week.length > 0 ? s.days_of_week : [0, 1, 2, 3, 4, 5, 6]
      if (pyWeekday === undefined || !days.includes(pyWeekday)) continue

      // UTC-момент слота: локальная дата в tz + время слота
      const localDate = `${get('year')}-${get('month')}-${get('day')}`
      const slotUtc = zonedTimeToUtc(localDate, hh, mm, tz)
      if (slotUtc.getTime() > now.getTime() && (!best || slotUtc < best)) {
        best = slotUtc
      }
    }
  }
  return best ? best.toISOString() : null
}

/** Переводит локальные дату/время в таймзоне tz в UTC (без внешних библиотек). */
function zonedTimeToUtc(dateStr: string, hh: number, mm: number, tz: string): Date {
  const guess = new Date(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`)
  // Смещение таймзоны на этот момент
  const inTz = new Date(guess.toLocaleString('en-US', { timeZone: tz }))
  const inUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess.getTime() - (inTz.getTime() - inUtc.getTime()))
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request)
    if (!user) return unauthorized()
    const [totals] = await sql`
      SELECT
        count(*) FILTER (WHERE p.status = 'published') AS total_posts,
        count(*) FILTER (WHERE p.status = 'published' AND p.published_at::date = now()::date) AS posts_today,
        count(*) FILTER (WHERE p.status IN ('queued', 'approved')) AS queued
      FROM posts p
      JOIN channels c ON c.id = p.channel_id
      WHERE c.user_id = ${user.userId}
        AND (c.chat_id ~ '^@[A-Za-z0-9_]{5,32}$' OR c.chat_id ~ '^-100[0-9]{6,}$')
    `
    const [lastPost] = await sql`
      SELECT p.text, p.topic, p.image_url, p.published_at
      FROM posts p
      JOIN channels c ON c.id = p.channel_id
      WHERE p.status = 'published' AND c.user_id = ${user.userId}
        AND (c.chat_id ~ '^@[A-Za-z0-9_]{5,32}$' OR c.chat_id ~ '^-100[0-9]{6,}$')
      ORDER BY p.published_at DESC
      LIMIT 1
    `

    // Ближайший слот публикации
    const schedules = await sql`
      SELECT s.post_time, s.days_of_week, s.timezone
      FROM schedules s
      JOIN channels c ON c.id = s.channel_id
      WHERE s.is_active AND c.is_active AND c.is_verified AND c.bot_can_post
        AND c.user_id = ${user.userId}
        AND (c.chat_id ~ '^@[A-Za-z0-9_]{5,32}$' OR c.chat_id ~ '^-100[0-9]{6,}$')
    `
    const nextPostAt = computeNextSlot(schedules as never)

    // Подписчики: последние точки за 7 дней + значение сутки назад для дельты
    const metricPoints = await sql`
      SELECT m.member_count, m.captured_at
      FROM channel_metrics m
      JOIN channels c ON c.id = m.channel_id
      WHERE c.user_id = ${user.userId}
        AND (c.chat_id ~ '^@[A-Za-z0-9_]{5,32}$' OR c.chat_id ~ '^-100[0-9]{6,}$')
        AND m.captured_at > now() - interval '7 days'
      ORDER BY m.captured_at
    `
    const points = (metricPoints as { member_count: number; captured_at: string }[]).map((m) => ({
      value: Number(m.member_count),
      at: m.captured_at,
    }))
    const current = points.length > 0 ? points[points.length - 1].value : null
    const dayAgoTs = Date.now() - 86400000
    const dayAgoPoint = [...points].reverse().find((p) => new Date(p.at).getTime() <= dayAgoTs)
    const delta24h = current !== null && dayAgoPoint ? current - dayAgoPoint.value : null

    return NextResponse.json({
      totalPosts: Number(totals?.total_posts ?? 0),
      postsToday: Number(totals?.posts_today ?? 0),
      queued: Number(totals?.queued ?? 0),
      lastPost: lastPost ?? null,
      nextPostAt,
      subscribers: {
        current,
        delta24h,
        // Прореживаем до ~40 точек для спарклайна
        series: points.filter((_, i) => points.length <= 40 || i % Math.ceil(points.length / 40) === 0).map((p) => p.value),
      },
    })
  } catch (error) {
    console.error('[stats] query failed', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
