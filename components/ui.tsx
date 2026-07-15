import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="flex items-end justify-between gap-3 px-5 pb-2 pt-8">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-balance text-[26px] font-semibold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-pretty text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 pb-1">{action}</div> : null}
    </header>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass p-4 ${className}`}>{children}</div>
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass pressable flex flex-col gap-1 p-4">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="num text-[24px] font-semibold leading-tight text-foreground">{value}</span>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="glass flex flex-col items-center gap-3 px-5 py-9 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border border-border bg-white/[0.04] text-muted-foreground">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-[280px] text-pretty text-[12px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-0.5">
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  )
}

export function StatusPill({
  children,
  tone = 'green',
}: {
  children: ReactNode
  tone?: 'green' | 'dim' | 'blue' | 'yellow' | 'red'
}) {
  const tones = {
    green: 'pill-scheduled',
    yellow: 'pill-ready',
    blue: 'pill-posted',
    dim: 'border border-border bg-muted text-muted-foreground',
    red: 'border border-destructive/40 bg-destructive/10 text-destructive',
  }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>
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
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${percent}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          fill="var(--color-foreground)"
          fontSize="14"
          fontFamily="var(--font-sans)"
          fontWeight="600"
        >
          {percent}%
        </text>
      </svg>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}
