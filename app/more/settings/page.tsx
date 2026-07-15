'use client'

import useSWR from 'swr'
import { Link2, Lock, Server } from 'lucide-react'
import { Card, PageHeader, StatusPill } from '@/components/ui'
import { swrFetcher as fetcher } from '@/lib/client'

type Channel = { id: number; chat_id: string; title: string | null; topic: string; mode: string; is_active: boolean; is_verified: boolean; bot_can_post: boolean; verification_error: string | null }
type Runtime = { bridgeOnline: boolean; bridgeConfigured: boolean; proxyManagedBy: string; proxyVariables: string[]; keyStorage: string }

function Row({ label, value, right }: { label: string; value?: string; right?: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-2.5"><span className="text-sm text-muted-foreground">{label}</span><div className="flex min-w-0 items-center gap-2">{value ? <span className="truncate text-right font-mono text-xs">{value}</span> : null}{right}</div></div>
}

export default function SettingsPage() {
  const { data, isLoading, error } = useSWR<{ channels: Channel[]; runtime: Runtime }>('/api/config', fetcher)
  return (
    <div>
      <PageHeader title="Настройки" subtitle="Фактическое состояние каналов и инфраструктуры" />
      <div className="fade-up flex flex-col gap-5 px-5 py-6">
        <section aria-label="Каналы"><h2 className="mb-2 px-1 text-sm text-muted-foreground">Каналы</h2><Card className="!py-1.5 divide-y divide-border">
          {isLoading ? <p className="py-2.5 text-sm text-muted-foreground">Загрузка…</p> : error ? <p className="py-2.5 text-sm text-destructive">Не удалось загрузить состояние</p> : data?.channels?.length ? data.channels.map((channel) => (
            <div key={channel.id} className="py-2">
              <Row label={channel.title || channel.chat_id} right={<span className="flex items-center gap-1.5"><StatusPill tone={channel.is_verified && channel.bot_can_post && channel.is_active ? 'green' : 'yellow'}>{channel.is_verified && channel.bot_can_post ? 'проверен' : 'не проверен'}</StatusPill><Link2 size={14} className="text-primary" /></span>} />
              <p className="text-[11px] text-muted-foreground">{channel.topic} · {channel.mode}{channel.verification_error ? ` · ${channel.verification_error}` : ''}</p>
            </div>
          )) : <p className="py-2.5 text-sm text-muted-foreground">Каналы не добавлены.</p>}
        </Card></section>

        <section aria-label="Бот"><h2 className="mb-2 px-1 text-sm text-muted-foreground">Связь с ботом</h2><Card className="!py-1.5 divide-y divide-border">
          <Row label="Railway bridge" right={<StatusPill tone={data?.runtime?.bridgeOnline ? 'green' : 'yellow'}>{data?.runtime?.bridgeOnline ? 'онлайн' : data?.runtime?.bridgeConfigured ? 'не отвечает' : 'не настроен'}</StatusPill>} />
          <Row label="Сервис" right={<Server size={15} className="text-muted-foreground" />} value="Railway bot" />
        </Card></section>

        <section aria-label="Прокси"><h2 className="mb-2 px-1 text-sm text-muted-foreground">Прокси</h2><Card className="!py-1.5 divide-y divide-border">
          <Row label="Где настраивается" value={data?.runtime?.proxyManagedBy || 'Railway bot environment'} />
          <Row label="Переменные" value={(data?.runtime?.proxyVariables || ['TELEGRAM_PROXY_URL', 'OUTBOUND_PROXY_URL']).join(', ')} />
        </Card><p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">Mini App не может безопасно читать секретные значения Railway, поэтому здесь не показывается выдуманный зелёный статус прокси.</p></section>

        <section aria-label="API хранилище"><h2 className="mb-2 px-1 text-sm text-muted-foreground">API хранилище</h2><Card className="flex items-center justify-between !p-3"><div className="flex items-center gap-2.5"><Lock size={16} className="text-primary" /><span className="text-sm text-muted-foreground">Ключи провайдеров</span></div><StatusPill>зашифрованы</StatusPill></Card></section>
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">Пользовательские ключи хранятся в Postgres только в зашифрованном AES-256-GCM виде. Mini App никогда не возвращает расшифрованный ключ браузеру.</p>
      </div>
    </div>
  )
}
