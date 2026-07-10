'use client'

import useSWR from 'swr'
import { PageHeader, Toggle } from '@/components/ui'

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
      <PageHeader title="Стек провайдеров" />
      <div className="flex flex-col gap-3 p-4">
        <p className="px-1 text-xs text-muted-foreground">Приоритет и маршрутизация запросов</p>

        {isLoading ? (
          <div className="glass p-4">
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          </div>
        ) : providers.length === 0 ? (
          <div className="glass flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-sm text-foreground">Провайдеры ещё не настроены</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Стек появится после первого запуска бота. Добавить свои ключи можно в разделе «API хранилище».
            </p>
          </div>
        ) : (
          providers.map((p, index) => {
            const meta = META[p.provider] ?? { label: p.provider, cost: '' }
            return (
              <div key={p.provider} className="glass flex items-center gap-3 p-3">
                <span className="flex size-6 items-center justify-center rounded-md border border-primary/25 font-mono text-[11px] text-muted-foreground">
                  {index + 1}
                </span>
                <span className="ring-glow flex size-9 items-center justify-center rounded-lg bg-primary/10 font-mono text-sm font-bold text-primary">
                  {meta.label[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{meta.label}</p>
                  <p className="text-[11px] text-muted-foreground">{meta.cost}</p>
                </div>
                <span className={`font-mono text-[11px] ${p.is_enabled ? 'text-primary' : 'text-muted-foreground'}`}>
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
