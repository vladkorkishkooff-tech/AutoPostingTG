'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { KeyRound, Plus, Trash2, ExternalLink } from 'lucide-react'
import { PageHeader, Card, Toggle, StatusPill } from '@/components/ui'
import { BottomNav } from '@/components/bottom-nav'
import { ProviderMark } from '@/components/provider-mark'
import { PROVIDERS_CATALOG, providerById } from '@/lib/providers-catalog'

import { swrFetcher as fetcher, apiFetch, haptic } from '@/lib/client'

type ApiKeyRow = {
  id: number
  provider: string
  model: string | null
  label: string | null
  base_url: string | null
  key_hint: string
  priority: number
  is_active: boolean
  last_error: string | null
}

export default function KeysPage() {
  const { data, mutate } = useSWR<{ keys: ApiKeyRow[] }>('/api/keys', fetcher)
  const keys = data?.keys ?? []

  const [showForm, setShowForm] = useState(false)
  const [provider, setProvider] = useState('custom')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const def = providerById(provider)

  async function saveKey() {
    haptic('medium')
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey,
          model: model || undefined,
          baseUrl: baseUrl || undefined,
          label: label || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Ошибка сохранения')
      setShowForm(false)
      setApiKey('')
      setModel('')
      setBaseUrl('')
      setLabel('')
      mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  async function toggleKey(id: number, isActive: boolean) {
    haptic('light')
    await apiFetch(`/api/keys/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    })
    mutate()
  }

  async function deleteKey(id: number) {
    haptic('medium')
    await apiFetch(`/api/keys/${id}`, { method: 'DELETE' })
    mutate()
  }

  return (
    <div className="flex min-h-dvh flex-col pb-20">
      <PageHeader
        title="API-ключи"
        subtitle="Ваши ключи хранятся в зашифрованном виде"
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

      <main className="fade-up flex flex-col gap-3 px-5 py-6">
        {showForm ? (
          <Card className="flex flex-col gap-3">
            <span className="text-[12px] font-medium text-muted-foreground">Новый ключ</span>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">Провайдер</span>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value)
                  setModel('')
                }}
                className="glass px-3 py-2.5 text-sm outline-none"
              >
                {PROVIDERS_CATALOG.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            {def && def.models.length > 0 ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground">Модель</span>
                <select value={model} onChange={(e) => setModel(e.target.value)} className="glass px-3 py-2.5 text-sm outline-none">
                  <option value="">Авто (по умолчанию)</option>
                  {def.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {def?.needsBaseUrl ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground">Base URL</span>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="glass px-3 py-2.5 font-mono text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>
            ) : null}

            {def?.needsBaseUrl ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground">Модель (ID)</span>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="например, my-model-v1"
                  className="glass px-3 py-2.5 font-mono text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>
            ) : null}

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">API-ключ</span>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type="password"
                placeholder="sk-…"
                className="glass px-3 py-2.5 font-mono text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">Название (необязательно)</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Основной ключ"
                className="glass px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>

            {def?.keyUrl ? (
              <a
                href={def.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-primary"
              >
                <ExternalLink size={12} aria-hidden="true" />
                Где взять ключ
              </a>
            ) : null}

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            <button
              type="button"
              onClick={saveKey}
              disabled={saving || !apiKey || (def?.needsBaseUrl && !baseUrl)}
              className="btn-green px-4 py-2.5 text-sm disabled:opacity-40"
            >
              {saving ? 'Сохраняю…' : 'Сохранить ключ'}
            </button>
          </Card>
        ) : null}

        {keys.length === 0 && !showForm ? (
          <Card className="flex flex-col items-center gap-2 py-8 text-center">
            <KeyRound size={28} className="text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Ключей пока нет. Добавьте свой API-ключ — генерация будет идти через него без лимитов.
            </p>
          </Card>
        ) : null}

        <ul className="flex flex-col gap-2">
          {keys.map((k) => {
            const kdef = providerById(k.provider)
            return (
              <li key={k.id}>
                <Card className="flex items-center gap-3">
                  <ProviderMark provider={k.provider} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {k.label || kdef?.name || k.provider}
                      </span>
                      {k.last_error ? <StatusPill tone="yellow">ошибка</StatusPill> : null}
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {k.model || 'авто'} · {k.key_hint}
                    </span>
                  </div>
                  <Toggle checked={k.is_active} onChange={(v) => toggleKey(k.id, v)} label={`Ключ ${k.key_hint}`} />
                  <button
                    type="button"
                    onClick={() => deleteKey(k.id)}
                    aria-label="Удалить ключ"
                    className="text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </Card>
              </li>
            )
          })}
        </ul>

        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          Ключи шифруются (AES-256) и используются только для генерации ваших постов. Приоритет — сверху вниз;
          если ключ недоступен, система переключится на следующий.
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
