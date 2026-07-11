'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, PenSquare, CalendarClock, Inbox, MoreHorizontal } from 'lucide-react'
import { haptic } from '@/lib/client'

const items = [
  { href: '/', label: 'Дашборд', icon: Home, primary: false },
  { href: '/queue', label: 'Очередь', icon: Inbox, primary: false },
  { href: '/generator', label: 'Генератор', icon: PenSquare, primary: true },
  { href: '/schedule', label: 'Расписание', icon: CalendarClock, primary: false },
  { href: '/more', label: 'Ещё', icon: MoreHorizontal, primary: false },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md border-t border-border bg-background/75 backdrop-blur-xl"
    >
      <ul className="flex items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ href, label, icon: Icon, primary }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))

          if (primary) {
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => haptic('light')}
                  className="pressable relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-foreground"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-9 -mt-4 items-center justify-center rounded-full border transition-colors ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-primary'
                    }`}
                    style={{ boxShadow: '0 4px 16px -4px rgba(94,106,210,0.45)' }}
                  >
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  {label}
                </Link>
              </li>
            )
          }

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                onClick={() => haptic('light')}
                className={`pressable relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-px left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary"
                  />
                ) : null}
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
