import Link from 'next/link'
import { Layers, Settings, ChevronRight, ImageIcon, Dna, KeyRound, BarChart3, Radio, History } from 'lucide-react'
import { PageHeader } from '@/components/ui'

const groups: {
  label: string
  items: { href: string; icon: typeof Radio; title: string; description: string }[]
}[] = [
  {
    label: 'Контент',
    items: [
      {
        href: '/more/channels',
        icon: Radio,
        title: 'Каналы',
        description: 'Несколько каналов: темы, медиа, пул тем',
      },
      {
        href: '/history',
        icon: History,
        title: 'История публикаций',
        description: 'Все опубликованные посты канала',
      },
      {
        href: '/more/media',
        icon: ImageIcon,
        title: 'Медиа лаборатория',
        description: 'Источники изображений и галерея',
      },
    ],
  },
  {
    label: 'AI и генерация',
    items: [
      {
        href: '/more/keys',
        icon: KeyRound,
        title: 'API хранилище',
        description: 'Свои ключи: Claude, GPT, Gemini и другие',
      },
      {
        href: '/more/providers',
        icon: Layers,
        title: 'Стек провайдеров',
        description: 'Приоритет и маршрутизация запросов',
      },
      {
        href: '/more/style',
        icon: Dna,
        title: 'Обучение стиля',
        description: 'Стиль DNA вашего канала',
      },
    ],
  },
  {
    label: 'Система',
    items: [
      {
        href: '/more/stats',
        icon: BarChart3,
        title: 'Статистика',
        description: 'Генерации, провайдеры, успешность',
      },
      {
        href: '/more/settings',
        icon: Settings,
        title: 'Настройки и безопасность',
        description: 'Прокси, канал, администраторы, логи',
      },
    ],
  },
]

export default function MorePage() {
  return (
    <div>
      <PageHeader title="Ещё" subtitle="Ключи, провайдеры, стиль и настройки системы" />
      <div className="fade-up flex flex-col gap-6 px-5 py-6">
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <p className="eyebrow mb-2.5 px-0.5">{group.label}</p>
            <div className="glass flex flex-col overflow-hidden !p-0">
              {group.items.map(({ href, icon: Icon, title, description }, i) => (
                <Link
                  key={href}
                  href={href}
                  className={`pressable flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-white/[0.03] ${
                    i > 0 ? 'border-t border-border' : ''
                  }`}
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon size={16} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground">{title}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{description}</p>
                  </div>
                  <ChevronRight size={15} className="shrink-0 text-muted-foreground/60" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
