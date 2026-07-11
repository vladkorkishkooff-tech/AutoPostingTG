'use client'

import { useMemo, useState } from 'react'
import { Dna, Plus } from 'lucide-react'
import { Card, PageHeader, Ring } from '@/components/ui'

const DEFAULT_CHIPS = ['Эталон', 'Коротко', 'Факт', 'Без воды']

function analyze(text: string) {
  const len = text.length
  const brevity = len === 0 ? 0 : Math.max(20, Math.min(98, Math.round(100 - len / 8)))
  const digits = (text.match(/\d/g) ?? []).length
  const factual = len === 0 ? 0 : Math.min(96, 55 + digits * 6)
  const punch = (text.match(/[!?«»—]/g) ?? []).length
  const engagement = len === 0 ? 0 : Math.min(92, 48 + punch * 8)
  const emoji = (text.match(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu) ?? []).length
  const emojiScore = len === 0 ? 0 : Math.min(90, 30 + emoji * 18)
  return { brevity, factual, engagement, emojiScore }
}

export default function StylePage() {
  const [sample, setSample] = useState('')
  const [chips, setChips] = useState(DEFAULT_CHIPS)
  const [trained, setTrained] = useState(false)
  const dna = useMemo(() => analyze(sample), [sample])

  return (
    <div>
      <PageHeader title="Стиль" subtitle="Бот учится писать в манере вашего канала" />
      <div className="fade-up flex flex-col gap-5 px-5 py-6">
        <label className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Пример вашего идеального поста</span>
            <span className="font-mono text-[11px] text-muted-foreground">{sample.length}/800</span>
          </div>
          <textarea
            value={sample}
            onChange={(e) => {
              setSample(e.target.value)
              setTrained(false)
            }}
            maxLength={800}
            rows={5}
            placeholder="Вставьте пост, который отражает стиль вашего канала…"
            className="glass resize-none px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
        </label>

        <section aria-label="Стиль DNA">
          <h2 className="mb-3 px-1 text-sm text-muted-foreground">Стиль DNA</h2>
          <Card className="grid grid-cols-4 gap-2 !p-3">
            <Ring percent={dna.brevity} label="Краткость" size={72} />
            <Ring percent={dna.factual} label="Фактичность" size={72} />
            <Ring percent={dna.engagement} label="Вовлечение" size={72} />
            <Ring percent={dna.emojiScore} label="Эмодзи" size={72} />
          </Card>
        </section>

        <section aria-label="Ключевые элементы">
          <h2 className="mb-2 px-1 text-sm text-muted-foreground">Ключевые элементы</h2>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setChips(chips.filter((c) => c !== chip))}
                className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs text-primary"
              >
                {chip}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                const value = prompt('Новый элемент стиля:')
                if (value?.trim()) setChips([...chips, value.trim()])
              }}
              className="flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground"
            >
              <Plus size={12} aria-hidden="true" />
              Добавить
            </button>
          </div>
        </section>

        <button
          type="button"
          disabled={sample.length < 20}
          onClick={() => setTrained(true)}
          className="btn-green flex items-center justify-center gap-2 px-4 py-3 text-sm disabled:opacity-40"
        >
          <Dna size={16} aria-hidden="true" />
          {trained ? 'Стиль сохранён' : 'Обучить стиль'}
        </button>

        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Профиль стиля сохраняется в style_profile канала и добавляется в промпт генерации, чтобы
          посты звучали как ваши, а не как шаблонный ИИ.
        </p>
      </div>
    </div>
  )
}
