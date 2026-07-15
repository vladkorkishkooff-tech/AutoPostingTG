'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Plus, Radio, ChevronDown, X } from 'lucide-react'
import { PageHeader, Toggle, Skeleton, EmptyState, StatusPill } from '@/components/ui'
import { swrFetcher as fetcher, apiFetch, haptic } from '@/lib/client'

type Channel = {
  id: number
  chat_id: string
  title: string | null
  topic: string
  mode: string
  image_policy: string
  is_active: boolean
  is_verified: boolean
  telegram_chat_id: string | number | null
  telegram_title: string | null
  telegram_username: string | null
  bot_can_post: boolean
  verified_at: string | null
  verification_error: string | null
  active_schedules: number
  published_posts: number
}

type PoolTopic = {
  id: number
  topic: string
  is_active: boolean
  last_used_at: string | null
}

const IMAGE_POLICY_OPTIONS = [
  { id: 'auto', label: 'Фото включены', hint: 'Бот сам подбирает фото к каждому посту (по умолчанию)' },
  { id: 'ai', label: 'AI-генерация', hint: 'Изображение генерирует нейросеть, при сбое — стоковое фото' },
  { id: 'off', label: 'Без фото', hint: 'Посты публикуются только текстом' },
]

function TopicPool({ channelId }: { channelId: number }) {
  const { data, mutate, isLoading } = useSWR<{ topics: PoolTopic[] }>(
    `/api/topics?channelId=${channelId}`,
    fetcher,
  )
  const [newTopic, setNewTopic] = useState('')
  const [saving, setSaving] = useState(false)
  const topics = data?.topics ?? []

  async function addTopic() {
    const topic = newTopic.trim()
    if (!topic) return
    haptic('medium')
    setSaving(true)
    try {
      await apiFetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, topic }),
      })
      setNewTopic('')
      mutate()
    } finally {
      setSaving(false)
    }
  }

  async function removeTopic(id: number) {
    haptic('light')
    await apiFetch(`/api/topics/${id}`, { method: 'DELETE' })
    mutate()
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Пул тем: бот перебирает их по кругу без повторов. Если пул пуст — используется тема канала или слота.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newTopic}
          onChange={(e) => setNewTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !(e.nativeEvent as unknown as { isComposing?: boolean }).isComposing && e.keyCode !== 229) {
              e.preventDefault()
              addTopic()
            }
          }}
          placeholder="Новая тема, напр. «космос»"
          aria-label="Новая тема для пула"
          className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
        />
        <button
          type="button"
          onClick={addTopic}
          disabled={saving || !newTopic.trim()}
          aria-label="Добавить тему"
          className="btn-outline-green pressable flex items-center justify-center p-2 disabled:opacity-50"
        >
          <Plus size={15} aria-hidden="true" />
        </button>
      </div>
      {isLoading ? (
        <Skeleton className="h-8" />
      ) : topics.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {topics.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-white/[0.04] py-1 pl-3 pr-1.5 text-[12px] text-foreground"
            >
              {t.topic}
              <button
                type="button"
                onClick={() => removeTopic(t.id)}
                aria-label={`Удалить тему ${t.topic}`}
                className="flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-destructive"
              >
                <X size={11} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function ChannelCard({ channel, onChanged }: { channel: Channel; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(channel.title ?? '')
  const [topic, setTopic] = useState(channel.topic)
  const [mode, setMode] = useState(channel.mode)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function patch(payload: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const response = await apiFetch(`/api/channels/${channel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const data = await response.json()
        setError(channelErrorMessage(data.error))
        haptic('error')
        return
      }
      haptic('success')
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function disconnect() {
    if (!window.confirm('Отключить канал и его расписания? История публикаций сохранится.')) return
    setSaving(true)
    setError(null)
    try {
      const response = await apiFetch(`/api/channels/${channel.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('disconnect_failed')
      haptic('success')
      onChanged()
    } catch {
      setError('Не удалось отключить канал.')
      haptic('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass flex flex-col">
      <div className="flex items-center gap-3 p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Radio size={17} aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium text-foreground">
            {channel.telegram_title || channel.title || channel.chat_id}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {channel.chat_id} · {channel.published_posts} постов · {channel.active_schedules} слот(ов)
          </span>
        </div>
        <StatusPill tone={channel.is_verified && channel.bot_can_post ? 'green' : 'blue'}>
          {channel.is_verified && channel.bot_can_post ? 'проверен' : 'не проверен'}
        </StatusPill>
        <button
          type="button"
          onClick={() => {
            haptic('light')
            setOpen((v) => !v)
          }}
          aria-expanded={open}
          aria-label={`Настройки канала ${channel.chat_id}`}
          className="pressable text-muted-foreground"
        >
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {open ? (
        <div className="flex flex-col gap-4 border-t border-border p-4">
          <div className="rounded-lg border border-border bg-white/[0.03] p-3 text-[12px] text-muted-foreground">
            <p>Telegram ID: {channel.telegram_chat_id ?? 'не определён'}</p>
            <p>Право публикации: {channel.bot_can_post ? 'есть' : 'нет'}</p>
            <p>Проверен: {channel.verified_at ? new Date(channel.verified_at).toLocaleString('ru-RU') : 'никогда'}</p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => patch({ reverify: true })}
            className="btn-outline-green pressable px-3 py-2 text-[12px] disabled:opacity-50"
          >
            Проверить канал и права бота
          </button>
          {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-foreground">Канал активен</span>
            <Toggle
              checked={channel.is_active}
              onChange={(v) => {
                haptic('light')
                patch({ isActive: v })
              }}
              label="Активность канала"
            />
          </div>

          <div className="grid gap-2">
            <label className="grid gap-1 text-[12px] text-muted-foreground">
              Отображаемое название
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border border-border bg-muted px-3 py-2 text-foreground" />
            </label>
            <label className="grid gap-1 text-[12px] text-muted-foreground">
              Тема по умолчанию
              <input value={topic} onChange={(e) => setTopic(e.target.value)} className="rounded-lg border border-border bg-muted px-3 py-2 text-foreground" />
            </label>
            <label className="grid gap-1 text-[12px] text-muted-foreground">
              Режим по умолчанию
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="rounded-lg border border-border bg-muted px-3 py-2 text-foreground">
                <option value="normal">Стандарт</option>
                <option value="short">Коротко</option>
                <option value="long">Лонгрид</option>
                <option value="funny">Юмор</option>
                <option value="wow">Вау</option>
                <option value="strict">Строго</option>
              </select>
            </label>
            <button type="button" disabled={saving || !topic.trim()} onClick={() => patch({ title, topic, mode })} className="btn-blue pressable px-3 py-2 text-[12px] disabled:opacity-50">
              Сохранить настройки
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Медиа в постах
            </span>
            <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Политика изображений">
              {IMAGE_POLICY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={channel.image_policy === opt.id}
                  onClick={() => {
                    haptic('light')
                    patch({ imagePolicy: opt.id })
                  }}
                  className={`pressable flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    channel.image_policy === opt.id
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border bg-white/[0.03]'
                  }`}
                >
                  <span className="text-[13px] font-medium text-foreground">{opt.label}</span>
                  <span className="text-[11px] leading-relaxed text-muted-foreground">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Пул тем
            </span>
            <TopicPool channelId={channel.id} />
          </div>

          <button
            type="button"
            disabled={saving || !channel.is_active}
            onClick={disconnect}
            className="pressable flex items-center justify-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-[12px] text-destructive disabled:opacity-40"
          >
            <X size={14} aria-hidden="true" />
            Отключить канал
          </button>
        </div>
      ) : null}
    </div>
  )
}

function channelErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    invalid_publication_target: 'Укажите @username канала или приватный ID, начинающийся с -100. Личный ID использовать нельзя.',
    channel_not_found: 'Канал не найден. Проверьте адрес и добавьте бота в канал.',
    target_not_channel: 'Это не Telegram-канал. Группы и личные чаты не поддерживаются.',
    bot_not_admin: 'Бот найден, но не назначен администратором канала.',
    bot_cannot_post: 'У бота нет права публиковать сообщения в этом канале.',
    permission_check_failed: 'Telegram не позволил проверить права бота. Проверьте его участие в канале.',
    bridge_unavailable: 'Бот временно недоступен. Попробуйте ещё раз.',
  }
  return messages[code] || 'Не удалось проверить канал.'
}

export default function ChannelsPage() {
  const { data, mutate, isLoading } = useSWR<{ channels: Channel[] }>('/api/channels', fetcher)
  const [showForm, setShowForm] = useState(false)
  const [chatId, setChatId] = useState('')
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const channels = data?.channels ?? []

  async function addChannel() {
    haptic('medium')
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, title: title || undefined, topic: topic || undefined }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(channelErrorMessage(data.error))
        haptic('error')
        return
      }
      haptic('success')
      setChatId('')
      setTitle('')
      setTopic('')
      setShowForm(false)
      mutate()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-24">
      <PageHeader
        title="Каналы"
        subtitle="Несколько каналов — у каждого своё расписание, темы и медиа"
        action={
          <button
            type="button"
            onClick={() => {
              haptic('light')
              setShowForm((v) => !v)
            }}
            className="btn-green pressable flex items-center gap-1.5 px-3 py-2 text-xs"
          >
            <Plus size={14} aria-hidden="true" />
            Добавить
          </button>
        }
      />

      <div className="fade-up flex flex-col gap-4 px-5 py-6">
        {showForm ? (
          <div className="glass-strong flex flex-col gap-3 p-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">Канал (@username или ID вида -100…)</span>
              <input
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="@mychannel"
                className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">Название (необязательно)</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Мой научный канал"
                className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">Тема по умолчанию</span>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="наука"
                className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
              />
            </label>
            {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Важно: бот должен быть администратором канала с правом публикации.
            </p>
            <button
              type="button"
              onClick={addChannel}
              disabled={saving || !chatId.trim()}
              className="btn-blue pressable px-4 py-2.5 text-sm disabled:opacity-50"
            >
              {saving ? 'Добавление…' : 'Добавить канал'}
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[68px] !rounded-xl" />
            <Skeleton className="h-[68px] !rounded-xl" />
          </div>
        ) : channels.length === 0 ? (
          <EmptyState
            icon={<Radio size={18} aria-hidden="true" />}
            title="Каналов пока нет"
            description="Добавьте первый канал — укажите @username и сделайте бота его администратором."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {channels.map((c) => (
              <ChannelCard key={c.id} channel={c} onChanged={() => mutate()} />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
