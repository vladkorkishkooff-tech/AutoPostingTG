'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { ArrowDown, ArrowUp, Layers } from 'lucide-react'
import { PageHeader, Toggle, Skeleton, EmptyState } from '@/components/ui'
import { ProviderMark } from '@/components/provider-mark'
import { apiFetch, haptic, swrFetcher as fetcher } from '@/lib/client'

type Provider = {
  provider: string
  priority: number
  is_enabled: boolean
  active_keys: number
  has_healthy_key: boolean
  last_error: string | null
}

export default function ProvidersPage() {
  const { data, isLoading, mutate } = useSWR<{ providers: Provider[] }>('/api/config', fetcher)
  const providers = data?.providers ?? []
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(next: Provider[]) {
    const previous = data
    await mutate({ ...(data ?? { providers: [] }), providers: next }, { revalidate: false })
    setBusy(true)
    setError('')
    try {
      const response = await apiFetch('/api/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: next.map(({ provider, is_enabled }) => ({ provider, is_enabled })) }),
      })
      if (!response.ok) throw new Error('save_failed')
      haptic('success')
      await mutate()
    } catch {
      setError('Не удалось сохранить порядок провайдеров')
      haptic('error')
      await mutate(previous, { revalidate: false })
    } finally { setBusy(false) }
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= providers.length) return
    const next = [...providers]
    ;[next[index], next[target]] = [next[target], next[index]]
    void save(next)
  }

  return (
    <div>
      <PageHeader title="Провайдеры" subtitle="Реальный порядок пользовательских AI-ключей" />
      <div className="fade-up flex flex-col gap-3 px-5 py-6">
        {isLoading ? <><Skeleton className="h-[76px] !rounded-xl" /><Skeleton className="h-[76px] !rounded-xl" /></> : providers.length === 0 ? (
          <EmptyState icon={<Layers size={18} aria-hidden="true" />} title="Нет настроенных провайдеров" description="Добавьте ключ в разделе «API-ключи». Провайдер появится здесь после сохранения." />
        ) : providers.map((provider, index) => {
          const online = provider.is_enabled && provider.active_keys > 0 && provider.has_healthy_key
          return (
            <div key={provider.provider} className="glass flex items-center gap-3 p-3.5">
              <div className="flex flex-col">
                <button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Поднять ${provider.provider}`} className="p-1 text-muted-foreground disabled:opacity-20"><ArrowUp size={13} /></button>
                <button type="button" disabled={busy || index === providers.length - 1} onClick={() => move(index, 1)} aria-label={`Опустить ${provider.provider}`} className="p-1 text-muted-foreground disabled:opacity-20"><ArrowDown size={13} /></button>
              </div>
              <ProviderMark provider={provider.provider} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium capitalize text-foreground">{provider.provider}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {provider.active_keys ? `${provider.active_keys} активн. ключ` : 'нет активного ключа'}
                  {provider.last_error ? ` · ошибка: ${provider.last_error}` : ''}
                </p>
              </div>
              <span className={`text-[11px] ${online ? 'text-[#4cb782]' : 'text-muted-foreground'}`}>
                {!provider.is_enabled ? 'Выкл' : online ? 'Готов' : 'Нет ключа'}
              </span>
              <Toggle checked={provider.is_enabled} label={`Провайдер ${provider.provider}`} disabled={busy || provider.active_keys === 0} onChange={(value) => void save(providers.map((item, itemIndex) => itemIndex === index ? { ...item, is_enabled: value } : item))} />
            </div>
          )
        })}
        {error ? <p role="alert" className="px-1 text-xs text-destructive">{error}</p> : null}
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Переключатели и порядок сохраняются в базе. Бот использует только включённые ключи сверху вниз.
        </p>
      </div>
    </div>
  )
}
