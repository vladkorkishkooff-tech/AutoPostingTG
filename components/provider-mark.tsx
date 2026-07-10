'use client'

/**
 * Фирменный знак провайдера: монограмма на брендовом тоне.
 * Тон приглушён под тёмную тему, чтобы не спорить с индиго-акцентом.
 */
const BRAND: Record<string, { bg: string; fg: string; mark: string }> = {
  openai: { bg: 'rgba(116,197,165,0.14)', fg: '#74c5a5', mark: 'AI' },
  anthropic: { bg: 'rgba(217,119,87,0.14)', fg: '#d97757', mark: 'A' },
  gemini: { bg: 'rgba(108,141,235,0.14)', fg: '#6c8deb', mark: 'G' },
  deepseek: { bg: 'rgba(77,107,254,0.14)', fg: '#7d95fe', mark: 'DS' },
  groq: { bg: 'rgba(240,80,50,0.13)', fg: '#e57356', mark: 'Gq' },
  mistral: { bg: 'rgba(255,175,0,0.13)', fg: '#e0a930', mark: 'M' },
  openrouter: { bg: 'rgba(148,163,184,0.13)', fg: '#94a3b8', mark: 'OR' },
  minimax: { bg: 'rgba(226,72,114,0.13)', fg: '#e24872', mark: 'MM' },
  zhipu: { bg: 'rgba(56,132,255,0.14)', fg: '#5c9aff', mark: 'GLM' },
  nvidia: { bg: 'rgba(118,185,0,0.13)', fg: '#8fc63f', mark: 'NV' },
  custom: { bg: 'rgba(255,255,255,0.07)', fg: '#8a8f98', mark: '⚙' },
}

export function ProviderMark({ provider, size = 36 }: { provider: string; size?: number }) {
  const b = BRAND[provider] ?? BRAND.custom
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-lg font-semibold"
      style={{
        width: size,
        height: size,
        background: b.bg,
        color: b.fg,
        fontSize: size * 0.34,
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {b.mark}
    </span>
  )
}
