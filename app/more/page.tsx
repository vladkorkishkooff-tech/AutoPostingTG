import Link from 'next/link'
import { Layers, Settings, ChevronRight } from 'lucide-react'
import { Card, PageHeader } from '@/components/ui'

const sections = [
  {
    href: '/more/providers',
    icon: Layers,
    title: 'Стек провайдеров',
    description: 'Приоритет и статус LLM-провайдеров',
  },
  {
    href: '/more/settings',
    icon: Settings,
    title: 'Настройки',
    description: 'Канал, администраторы, лимиты истории',
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
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
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
