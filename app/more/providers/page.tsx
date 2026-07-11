'use client'

import useSWR from 'swr'
import { Layers } from 'lucide-react'
import { PageHeader, Toggle, Skeleton, EmptyState } from '@/components/ui'
import { ProviderMark } from '@/components/provider-mark'

type Provider = { provider: string; priority: number; is_enabled: boolean }

const META: Record<string, { label: string; cost: string }> = {
  groq: { label: 'Groq', cost: 'Бесплатно' },
  mistral: { label: 'Mistral', cost: 'Бесплатно (ограничения)' },
  gemini: { label: 'Gemini', cost: 'Бесплатно (ограничения)' },
  nvidia: { label: 'NVIDIA', cost: 'Бесплатно (ограничения)' },
  openrouter: { label: 'OpenRouter', cost: 'Бесплатно/Платно' },
  custom: { label: 'Custom OpenAI', cost: 'Свой endpoint' },
}

import { swrFetcher as fetcher } from '@/lib/client'

export default function ProvidersPage() {
  const { data, isLoading } = useSWR<{ providers: Provider[] }>('/api/config', fetcher)
  const providers = data?.providers ?? []

  return (
    <div>
      <PageHeader title="Провайдеры" subtitle="Приоритет и маршрутизация AI-запросов" />
      <div className="fade-up flex flex-col gap-3 px-5 py-6">

        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[72px] !rounded-xl" />
            <Skeleton className="h-[72px] !rounded-xl" />
            <Skeleton className="h-[72px] !rounded-xl" />
          </div>
        ) : providers.length === 0 ? (
          <EmptyState
            icon={<Layers size={18} aria-hidden="true" />}
            title="Провайдеры ещё не настроены"
            description="Стек появится после первого запуска бота. Добавить свои ключи можно в разделе «API-ключи»."
          />
        ) : (
          providers.map((p, index) => {
            const meta = META[p.provider] ?? { label: p.provider, cost: '' }
            return (
              <div key={p.provider} className="glass flex items-center gap-3.5 p-4">
                <span className="flex size-6 items-center justify-center rounded-md border border-border text-[11px] text-muted-foreground">
                  {index + 1}
                </span>
                <ProviderMark provider={p.provider} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">{meta.label}</p>
                  <p className="text-[11px] text-muted-foreground">{meta.cost}</p>
                </div>
                <span className={`text-[11px] ${p.is_enabled ? 'text-[#4cb782]' : 'text-muted-foreground'}`}>
                  {p.is_enabled ? 'Онлайн' : 'Выкл'}
                </span>
                <Toggle checked={p.is_enabled} label={`Провайдер ${meta.label}`} disabled />
              </div>
            )
          })
        )}

        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Запросы идут по порядку приоритета. Порядок задаётся переменной LLM_PROVIDER_ORDER в
          окружении бота.
        </p>
      </div>
    </div>
  )
}
