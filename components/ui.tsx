import type { ReactNode } from 'react'
import { Menu } from 'lucide-react'

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <Menu size={18} className="text-muted-foreground" aria-hidden="true" />
        <h1 className="text-base font-semibold tracking-wide">{title}</h1>
      </div>
      {action}
    </header>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`neon-card rounded-2xl p-4 ${className}`}>{children}</div>
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1 !p-3">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="font-mono text-2xl font-semibold text-foreground">{value}</span>
      {hint ? <span className="font-mono text-[11px] text-primary">{hint}</span> : null}
    </Card>
  )
}

export function StatusPill({
  children,
  tone = 'green',
}: {
  children: ReactNode
  tone?: 'green' | 'dim' | 'blue'
}) {
  const tones = {
    green: 'border-primary/50 bg-primary/10 text-primary',
    dim: 'border-border bg-muted text-muted-foreground',
    blue: 'border-accent/50 bg-accent/10 text-accent',
  }
  return (
    <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange?: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${
        checked ? 'border-primary/60 bg-primary/25 neon-glow' : 'border-border bg-muted'
      }`}
    >
      <span
        className={`absolute top-0.5 size-4.5 rounded-full transition-all ${
          checked ? 'left-[calc(100%-1.25rem)] bg-primary' : 'left-0.5 bg-muted-foreground'
        }`}
        style={{ width: '1.125rem', height: '1.125rem' }}
      />
    </button>
  )
}

export function Ring({
  percent,
  label,
  size = 76,
}: {
  percent: number
  label: string
  size?: number
}) {
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const filled = (percent / 100) * c
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${percent}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-muted)" strokeWidth="5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: 'drop-shadow(0 0 6px rgba(53,224,141,0.5))' }}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          fill="var(--color-foreground)"
          fontSize="15"
          fontFamily="var(--font-mono)"
          fontWeight="600"
        >
          {percent}%
        </text>
      </svg>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}
