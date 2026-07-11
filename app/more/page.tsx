import Link from 'next/link'
import { Layers, Settings, ChevronRight, ImageIcon, Dna, KeyRound, BarChart3, Radio, History } from 'lucide-react'
import { Card, PageHeader } from '@/components/ui'

const sections = [
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
    href: '/more/keys',
    icon: KeyRound,
    title: 'API хранилище',
    description: 'Свои ключи: Claude, GPT, Gemini, DeepSeek и другие',
  },
  {
    href: '/more/stats',
    icon: BarChart3,
    title: 'Статистика',
    description: 'Генерации, провайдеры, успешность',
  },
  {
    href: '/more/media',
    icon: ImageIcon,
    title: 'Медиа лаборатория',
    description: 'Источники изображений и галерея',
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
  {
    href: '/more/settings',
    icon: Settings,
    title: 'Настройки и безопасность',
    description: 'Прокси, канал, администраторы, логи',
  },
]

export default function MorePage() {
  return (
    <div>
      <PageHeader title="Ещё" subtitle="Ключи, провайдеры, стиль и настройки системы" />
      <div className="fade-up flex flex-col gap-2.5 px-5 py-6">
        {sections.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href}>
            <Card className="flex items-center gap-3.5 transition-colors hover:border-white/15">
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon size={18} aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-foreground">{title}</p>
                <p className="text-[12px] text-muted-foreground">{description}</p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground" aria-hidden="true" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
