'use client'

import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TabItem {
  id: string
  label: string
}

interface TabsProps {
  items: TabItem[]
  active: string
  onChange: (id: string) => void
  label: string
  children: ReactNode
}

export function Tabs({ items, active, onChange, label, children }: TabsProps) {
  const move = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const next = items[(index + step + items.length) % items.length]
    if (next) onChange(next.id)
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b">
        {items.map((item, index) => {
          const selected = item.id === active
          return (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
              onKeyDown={(event) => move(event, index)}
              className={cn(
                '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring',
                selected
                  ? 'border-primary font-medium text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      <div id={`panel-${active}`} role="tabpanel" aria-labelledby={`tab-${active}`} className="pt-5">
        {children}
      </div>
    </div>
  )
}
