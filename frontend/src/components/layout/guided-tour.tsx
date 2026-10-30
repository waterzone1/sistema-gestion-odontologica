'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import type { TourStep } from '@/lib/tours'

interface Props {
  title: string
  steps: TourStep[]
  onClose: (completed: boolean) => void
}

interface Box {
  top: number
  left: number
  width: number
  height: number
}

const PADDING = 6
const CARD_WIDTH = 320
const GAP = 12

function elementFor(target: string | undefined): HTMLElement | null {
  if (!target) return null
  const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)
  return [...candidates].find((el) => el.getClientRects().length > 0) ?? null
}

export function visibleSteps(steps: TourStep[]): TourStep[] {
  return steps.filter((step) => !step.target || elementFor(step.target) !== null)
}

function boxOf(element: HTMLElement | null): Box | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return { top: rect.top - PADDING, left: rect.left - PADDING, width: rect.width + PADDING * 2, height: rect.height + PADDING * 2 }
}

function cardPosition(box: Box | null, cardHeight: number) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const width = Math.min(CARD_WIDTH, viewportWidth - 32)
  if (!box) return { top: Math.max(16, (viewportHeight - cardHeight) / 2), left: (viewportWidth - width) / 2, width }
  const below = box.top + box.height + GAP
  const above = box.top - GAP - cardHeight
  const top = below + cardHeight <= viewportHeight - 16 ? below : above >= 16 ? above : Math.max(16, viewportHeight - cardHeight - 16)
  const left = Math.min(Math.max(16, box.left), viewportWidth - width - 16)
  return { top, left, width }
}

export function GuidedTour({ title, steps, onClose }: Props) {
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [cardHeight, setCardHeight] = useState(180)
  const card = useRef<HTMLDivElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  const step = steps[index]
  const last = index === steps.length - 1

  const measure = useCallback(() => {
    setBox(boxOf(elementFor(step?.target)))
    if (card.current) setCardHeight(card.current.offsetHeight)
  }, [step])

  useLayoutEffect(() => {
    elementFor(step?.target)?.scrollIntoView({ block: 'center', inline: 'nearest' })
    const frame = window.requestAnimationFrame(measure)
    return () => window.cancelAnimationFrame(frame)
  }, [step, measure])

  useEffect(() => {
    next.current?.focus()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!step) return null
  const position = cardPosition(box, cardHeight)

  return createPortal(
    <div className="fixed inset-0 z-[60]" aria-hidden={false}>
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-lg ring-2 ring-primary transition-all duration-200 motion-reduce:transition-none"
          style={{ ...box, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.55)' }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-black/55" />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        className="fixed rounded-lg border bg-card p-4 text-card-foreground shadow-lg"
        style={position}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title} · {index + 1} de {steps.length}
        </p>
        <h2 id="tour-title" className="mt-1 font-semibold">
          {step.title}
        </h2>
        <p id="tour-text" className="mt-1 text-sm leading-relaxed">
          {step.text}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => onClose(false)}>
            {last ? 'Cerrar' : 'Saltear'}
          </Button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="outline" size="sm" onClick={() => setIndex(index - 1)}>
                Anterior
              </Button>
            )}
            <Button ref={next} size="sm" onClick={() => (last ? onClose(true) : setIndex(index + 1))}>
              {last ? 'Listo' : 'Siguiente'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
