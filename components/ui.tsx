import type { ReactNode } from 'react'
import { Menu } from 'lucide-react'

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-primary/10 bg-background/85 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <Menu size={18} className="text-muted-foreground" aria-hidden="true" />
        <h1 className="text-base font-semibold tracking-wide">{title}</h1>
      </div>
      {action}
    </header>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass p-4 ${className}`}>{children}</div>
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass flex flex-col gap-0.5 p-3">
      <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span className="font-mono text-[26px] font-bold leading-tight text-foreground">{value}</span>
      {hint ? <span className="font-mono text-[11px] text-primary">{hint}</span> : null}
    </div>
  )
}

export function StatusPill({
  children,
  tone = 'green',
}: {
  children: ReactNode
  tone?: 'green' | 'dim' | 'blue' | 'yellow'
}) {
  const tones = {
    green: 'pill-scheduled',
    yellow: 'pill-ready',
    blue: 'pill-posted',
    dim: 'border border-border bg-muted text-muted-foreground',
  }
  return (
    <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-wide ${tones[tone]}`}>
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
      className="switch disabled:opacity-40"
      data-on={checked ? 'true' : 'false'}
    />
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(47,226,142,0.12)" strokeWidth="5" />
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
          style={{ filter: 'drop-shadow(0 0 6px rgba(47,226,142,0.55))' }}
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
