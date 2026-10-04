'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { FileJson, Upload, CheckCircle2 } from 'lucide-react'
import { PageHeader, Card, StatusPill } from '@/components/ui'
import { apiFetch, swrFetcher as fetcher, haptic } from '@/lib/client'

type Channel = { id: number; title: string | null; chat_id: string; is_active: boolean; is_verified?: boolean; bot_can_post?: boolean }

export default function ImportPage() {
  const { data: channelsData } = useSWR<{ channels: Channel[] }>('/api/channels', fetcher)
  const channels = (channelsData?.channels ?? []).filter((channel) => channel.is_active && channel.is_verified && channel.bot_can_post)
  const [channelId, setChannelId] = useState('')
  const [json, setJson] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function importPack() {
    setBusy(true); setError(null); setMessage(null); haptic('medium')
    try {
      let pack: unknown
      try { pack = JSON.parse(json) } catch { throw new Error('Проверьте JSON: модель не должна добавлять ``` или пояснения.') }
      const response = await apiFetch('/api/content/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: Number(channelId), pack }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || data.error || 'Не удалось импортировать пакет')
      setMessage(`В очередь добавлено постов: ${data.count}. Проверьте их перед публикацией.`)
      haptic('success')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ошибка импорта'); haptic('error') } finally { setBusy(false) }
  }

  return <div className="flex min-h-dvh flex-col pb-20">
    <PageHeader title="Импорт из AI-агента" subtitle="Вставьте JSON-пакет от ChatGPT, Claude, Ollama или другой бесплатной модели" />
    <div className="fade-up flex flex-col gap-4 px-5 py-6">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-2"><FileJson size={17} className="text-primary" /><p className="text-[13px] font-medium">Пакет постов</p><StatusPill tone="blue">v1</StatusPill></div>
        <p className="text-[12px] leading-relaxed text-muted-foreground">Формат требует дату исследования и хотя бы один HTTPS-источник. Это защищает от устаревших фактов и случайной публикации выдумок.</p>
        <label className="flex flex-col gap-1.5"><span className="text-[11px] text-muted-foreground">Канал</span><select value={channelId} onChange={(event) => setChannelId(event.target.value)} className="glass px-3 py-2.5 text-sm outline-none"><option value="">Выберите канал</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.title || channel.chat_id}</option>)}</select></label>
        <textarea value={json} onChange={(event) => setJson(event.target.value)} rows={15} spellCheck={false} placeholder={'{\n  "schemaVersion": "autopostingtg.post-pack.v1",\n  ...\n}'} className="min-h-64 rounded-lg border border-border bg-black/10 px-3 py-2.5 font-mono text-[11px] leading-relaxed outline-none focus:border-primary/50" />
        {error ? <p role="alert" className="text-[12px] leading-relaxed text-destructive">{error}</p> : null}
        {message ? <p className="flex items-center gap-1.5 text-[12px] text-primary"><CheckCircle2 size={14} />{message}</p> : null}
        <button type="button" onClick={importPack} disabled={busy || !channelId || !json.trim()} className="btn-green pressable flex items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:opacity-40"><Upload size={15} />{busy ? 'Проверяю и добавляю…' : 'Проверить и добавить в очередь'}</button>
      </Card>
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">Шаблон и готовый промпт находятся в <code>docs/content/AGENT_POSTING_GUIDE.md</code>. После импорта публикация не происходит автоматически: сначала откройте очередь, отредактируйте и подтвердите посты.</p>
    </div>
  </div>
}
