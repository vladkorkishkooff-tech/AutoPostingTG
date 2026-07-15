'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Dna, Plus, X } from 'lucide-react'
import { Card, PageHeader, Ring, Skeleton } from '@/components/ui'
import { apiFetch, haptic, swrFetcher as fetcher } from '@/lib/client'

const DEFAULT_CHIPS = ['Коротко', 'Факт', 'Без воды']
type Metrics = { brevity: number; factual: number; engagement: number; emojiScore: number }
type Profile = { sample: string; elements: string[]; metrics: Metrics; updatedAt?: string }
type Channel = { id: number; title: string; style_profile: Profile | null }

function analyze(text: string): Metrics {
  const len = text.length
  const brevity = len === 0 ? 0 : Math.max(20, Math.min(98, Math.round(100 - len / 20)))
  const digits = (text.match(/\d/g) ?? []).length
  const factual = len === 0 ? 0 : Math.min(96, 55 + digits * 6)
  const punch = (text.match(/[!?«»—]/g) ?? []).length
  const engagement = len === 0 ? 0 : Math.min(92, 48 + punch * 8)
  const emoji = (text.match(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu) ?? []).length
  const emojiScore = len === 0 ? 0 : Math.min(90, 30 + emoji * 18)
  return { brevity, factual, engagement, emojiScore }
}

export default function StylePage() {
  const { data, isLoading, mutate } = useSWR<{ channels: Channel[] }>('/api/style', fetcher)
  const channels = data?.channels ?? []
  const [channelId, setChannelId] = useState<number | null>(null)
  const selected = channels.find((channel) => channel.id === channelId) ?? channels[0]

  return (
    <div>
      <PageHeader title="Стиль" subtitle="Сохранённая манера письма для каждого канала" />
      <div className="fade-up flex flex-col gap-5 px-5 py-6">
        {isLoading ? <Skeleton className="h-12 !rounded-xl" /> : channels.length ? (
          <label className="flex flex-col gap-2 text-sm text-muted-foreground">
            Канал
            <select value={selected?.id ?? ''} onChange={(event) => setChannelId(Number(event.target.value))} className="glass px-3 py-3 text-sm text-foreground outline-none focus:border-primary/60">
              {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.title}</option>)}
            </select>
          </label>
        ) : <p className="text-sm text-muted-foreground">Сначала добавьте канал.</p>}
        {selected ? <StyleEditor key={selected.id} channel={selected} onSaved={mutate} /> : null}
      </div>
    </div>
  )
}

function StyleEditor({ channel, onSaved }: { channel: Channel; onSaved: () => Promise<unknown> }) {
  const [sample, setSample] = useState(channel.style_profile?.sample ?? '')
  const [chips, setChips] = useState(channel.style_profile?.elements?.length ? channel.style_profile.elements : DEFAULT_CHIPS)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(Boolean(channel.style_profile))
  const [error, setError] = useState('')
  const dna = useMemo(() => analyze(sample), [sample])

  async function save() {
    setBusy(true)
    setError('')
    try {
      const response = await apiFetch('/api/style', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channel.id, sample, elements: chips, metrics: dna }),
      })
      if (!response.ok) throw new Error('save_failed')
      setSaved(true)
      haptic('success')
      await onSaved()
    } catch {
      setError('Не удалось сохранить профиль стиля')
      haptic('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
        <label className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Пример вашего идеального поста</span>
            <span className="font-mono text-[11px] text-muted-foreground">{sample.length}/4000</span>
          </div>
          <textarea
            value={sample}
            onChange={(event) => { setSample(event.target.value); setSaved(false) }}
            maxLength={4000}
            rows={7}
            placeholder="Вставьте реальный пост, который отражает стиль канала…"
            className="glass resize-none px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
        </label>

        <section aria-label="Параметры примера">
          <h2 className="mb-3 px-1 text-sm text-muted-foreground">Параметры примера</h2>
          <Card className="grid grid-cols-4 gap-2 !p-3">
            <Ring percent={dna.brevity} label="Краткость" size={72} />
            <Ring percent={dna.factual} label="Факты" size={72} />
            <Ring percent={dna.engagement} label="Подача" size={72} />
            <Ring percent={dna.emojiScore} label="Эмодзи" size={72} />
          </Card>
        </section>

        <section aria-label="Инструкции стиля">
          <h2 className="mb-2 px-1 text-sm text-muted-foreground">Инструкции стиля</h2>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button key={chip} type="button" onClick={() => { setChips(chips.filter((item) => item !== chip)); setSaved(false) }} className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs text-primary">
                {chip}<X size={11} aria-hidden="true" />
              </button>
            ))}
            <button type="button" onClick={() => { const value = prompt('Новая инструкция стиля:'); if (value?.trim() && !chips.includes(value.trim())) { setChips([...chips, value.trim().slice(0, 60)]); setSaved(false) } }} className="flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground">
              <Plus size={12} aria-hidden="true" />Добавить
            </button>
          </div>
        </section>

        <button type="button" disabled={sample.length < 20 || busy} onClick={save} className="btn-green flex items-center justify-center gap-2 px-4 py-3 text-sm disabled:opacity-40">
          <Dna size={16} aria-hidden="true" />
          {busy ? 'Сохранение…' : saved ? 'Стиль сохранён' : 'Сохранить стиль'}
        </button>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Профиль хранится в выбранном канале. Генератор получает пример и инструкции вместе с настройками канала.
        </p>
    </>
  )
}
