'use client'

import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import Link from 'next/link'
import { Radio, ChevronDown, Check, Plus, Settings2, X, Sparkles } from 'lucide-react'
import { swrFetcher as fetcher, apiFetch, haptic } from '@/lib/client'
import { StatusPill } from '@/components/ui'

type Channel = {
  id: number
  chat_id: string
  title: string | null
  telegram_title?: string | null
  topic: string
  mode: string
  is_active: boolean
  is_verified: boolean
  bot_can_post: boolean
  active_schedules?: number
  published_posts?: number
}

type ConfigData = {
  channel: Channel | null
  selectedChannelId?: number | null
  channels: Channel[]
}

export function ChannelSwitcher({ className = '' }: { className?: string }) {
  const { data: config, mutate: mutateConfig } = useSWR<ConfigData>('/api/config', fetcher)
  const { data: channelsData, mutate: mutateChannels } = useSWR<{ channels: Channel[] }>('/api/channels', fetcher)
  const { mutate } = useSWRConfig()

  const [isOpen, setIsOpen] = useState(false)
  const [switchingId, setSwitchingId] = useState<number | null>(null)

  const activeChannel = config?.channel ?? null
  const allChannels = channelsData?.channels ?? config?.channels ?? []
  const validChannels = allChannels.filter((c) => c.chat_id && (c.chat_id.startsWith('@') || c.chat_id.startsWith('-100')))

  async function selectChannel(channelId: number) {
    if (Number(activeChannel?.id) === Number(channelId)) {
      setIsOpen(false)
      return
    }

    haptic('medium')
    setSwitchingId(channelId)
    try {
      const res = await apiFetch('/api/channels/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      })

      if (res.ok) {
        haptic('success')
        await Promise.all([
          mutateConfig(),
          mutateChannels(),
          mutate('/api/stats'),
          mutate('/api/queue'),
        ])
        setIsOpen(false)
      } else {
        haptic('error')
      }
    } catch {
      haptic('error')
    } finally {
      setSwitchingId(null)
    }
  }

  if (validChannels.length === 0 && !activeChannel) {
    return (
      <Link
        href="/more/channels"
        onClick={() => haptic('light')}
        className={`glass pressable flex items-center justify-between gap-3 p-3.5 rounded-xl border border-primary/30 bg-primary/5 ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <Plus size={16} aria-hidden="true" />
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-foreground">Подключите первый канал</span>
            <span className="text-[11px] text-muted-foreground">Нажмите для добавления Telegram-канала</span>
          </div>
        </div>
        <span className="text-xs text-primary font-medium">Добавить →</span>
      </Link>
    )
  }

  const channelDisplayName = activeChannel?.title || activeChannel?.telegram_title || activeChannel?.chat_id || 'Выберите канал'

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          haptic('light')
          setIsOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsOpen(true)
          }
        }}
        className={`glass pressable flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:border-primary/40 transition-colors cursor-pointer ${className}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/20">
            <Radio size={16} aria-hidden="true" />
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-[rgb(76,183,130)] ring-2 ring-background animate-pulse" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate text-[13px] font-semibold text-foreground">
                {channelDisplayName}
              </span>
              <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] text-muted-foreground font-mono shrink-0">
                {activeChannel?.chat_id}
              </span>
            </div>
            <span className="truncate text-[11px] text-muted-foreground">
              Тема: {activeChannel?.topic || 'наука'} · Режим: {activeChannel?.mode || 'wow'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded-full border border-border bg-white/5 px-2 py-0.5 text-[11px] font-medium text-foreground/80 flex items-center gap-1">
            Сменить
            <ChevronDown size={13} className="text-muted-foreground" aria-hidden="true" />
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
          <div
            className="w-full max-w-md max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-white/15 bg-[#12161f] shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="channel-dialog-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/80 px-5 py-4">
              <div className="flex items-center gap-2">
                <Radio size={18} className="text-primary" aria-hidden="true" />
                <h3 id="channel-dialog-title" className="text-[16px] font-semibold text-foreground">
                  Центр управления каналами
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="pressable rounded-full p-1.5 text-muted-foreground hover:bg-white/10 transition-colors"
                aria-label="Закрыть"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
              <p className="px-1 text-[12px] text-muted-foreground">
                Выберите активный канал для дашборда, генератора постов и очереди публикаций:
              </p>

              {validChannels.map((channel) => {
                const isSelected = Number(activeChannel?.id) === Number(channel.id)
                const isBusy = Number(switchingId) === Number(channel.id)

                return (
                  <button
                    key={channel.id}
                    type="button"
                    disabled={isBusy}
                    onClick={() => selectChannel(channel.id)}
                    className={`pressable w-full text-left flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-primary/60 bg-primary/[0.12] ring-1 ring-primary/40 shadow-sm'
                        : 'border-border/60 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                    } ${isBusy ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${
                          isSelected
                            ? 'border-primary/40 bg-primary/20 text-primary'
                            : 'border-border bg-white/5 text-muted-foreground'
                        }`}
                      >
                        {isSelected ? <Check size={18} /> : <Radio size={16} />}
                      </div>

                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`truncate text-[13.5px] font-semibold ${isSelected ? 'text-foreground' : 'text-foreground/90'}`}>
                            {channel.title || channel.telegram_title || channel.chat_id}
                          </span>
                          {isSelected && (
                            <StatusPill tone="green">активен</StatusPill>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground truncate">
                          <span className="font-mono text-primary/80">{channel.chat_id}</span>
                          <span>·</span>
                          <span>Тема: {channel.topic || 'наука'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center">
                      {isSelected ? (
                        <span className="text-[12px] font-medium text-[rgb(76,183,130)] flex items-center gap-1">
                          Выбран
                        </span>
                      ) : (
                        <span className="text-[12px] font-medium text-muted-foreground hover:text-foreground">
                          {isBusy ? 'Переключение…' : 'Выбрать'}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Footer */}
            <div className="border-t border-border/80 p-4 bg-black/20 flex flex-col gap-2">
              <Link
                href="/more/channels"
                onClick={() => {
                  haptic('light')
                  setIsOpen(false)
                }}
                className="btn-outline-green pressable flex items-center justify-center gap-2 py-2.5 text-[13px] w-full"
              >
                <Settings2 size={15} aria-hidden="true" />
                Настроить каналы и пул тем
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
