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

const DEMO_PROVIDERS: Provider[] = [
  { provider: 'groq', priority: 1, is_enabled: true },
  { provider: 'nvidia', priority: 2, is_enabled: true },
  { provider: 'openrouter', priority: 3, is_enabled: true },
  { provider: 'gemini', priority: 4, is_enabled: true },
  { provider: 'mistral', priority: 5, is_enabled: true },
]

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function ProvidersPage() {
  const { data, isLoading } = useSWR<{ providers: Provider[] }>('/api/config', fetcher)
  const providers = (data?.providers?.length ?? 0) > 0 ? data!.providers : DEMO_PROVIDERS

  return (
    <div>
      <PageHeader title="Стек провайдеров" />
      <div className="flex flex-col gap-3 p-4">
        <p className="px-1 text-xs text-muted-foreground">Приоритет и маршрутизация запросов</p>

        {isLoading ? (
          <div className="glass p-4">
            <p className="text-sm text-muted-foreground">Загрузка…</p>
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
