'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, PenSquare, CalendarClock, History, MoreHorizontal } from 'lucide-react'

const items = [
  { href: '/', label: 'Дашборд', icon: Home },
  { href: '/generator', label: 'Генератор', icon: PenSquare },
  { href: '/schedule', label: 'Расписание', icon: CalendarClock },
  { href: '/history', label: 'История', icon: History },
  { href: '/more', label: 'Ещё', icon: MoreHorizontal },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md border-t border-border bg-background/90 backdrop-blur-md"
    >
      <ul className="flex items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon size={19} aria-hidden="true" className={active ? 'text-primary' : undefined} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
