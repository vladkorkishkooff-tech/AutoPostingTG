import Link from 'next/link'
import { Layers, Settings, ChevronRight, ImageIcon, Dna } from 'lucide-react'
import { Card, PageHeader } from '@/components/ui'

const sections = [
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
      <PageHeader title="Ещё" />
      <div className="flex flex-col gap-3 p-4">
        {sections.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href}>
            <Card className="flex items-center gap-3">
              <div className="neon-glow flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon size={20} aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <ChevronRight size={18} className="text-muted-foreground" aria-hidden="true" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
