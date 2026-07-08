'use client'

import useSWR from 'swr'
import { Card, PageHeader } from '@/components/ui'

type Provider = { provider: string; priority: number; is_enabled: boolean }

const LABELS: Record<string, string> = {
  groq: 'Groq',
  mistral: 'Mistral',
  gemini: 'Gemini',
  nvidia: 'NVIDIA',
  openrouter: 'OpenRouter',
  custom: 'Custom OpenAI',
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function ProvidersPage() {
  const { data, isLoading } = useSWR<{ providers: Provider[] }>('/api/config', fetcher)
  const providers = data?.providers ?? []

  return (
    <div>
      <PageHeader title="Стек провайдеров" />
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-muted-foreground">
          Запросы идут по порядку приоритета. Если провайдер недоступен, бот переключается на
          следующий.
        </p>

        {isLoading ? (
          <Card>
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          </Card>
        ) : (
          providers.map((p, index) => (
            <Card key={p.provider} className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">{LABELS[p.provider] ?? p.provider}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] ${
                  p.is_enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {p.is_enabled ? 'включён' : 'выключен'}
              </span>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
