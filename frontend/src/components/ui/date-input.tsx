'use client'

import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentProps, type Ref } from 'react'
import { MaskedInput } from '@/components/ui/input'
import { maskDate, parseDateText, toDateText } from '@/lib/format'
import { cn } from '@/lib/utils'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEKDAYS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do']

type Props = Omit<ComponentProps<'input'>, 'type'> & { ref?: Ref<HTMLInputElement>; fromYear?: number; toYear?: number }

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === 'function') ref(value)
  else if (ref) (ref as { current: T }).current = value
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

export function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = Array.from({ length: offset }, () => null)
  for (let day = 1; day <= days; day++) cells.push(new Date(year, month, day))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function DateInput({ ref, className, disabled, fromYear = 1900, toYear, placeholder = 'dd/mm/aaaa', ...props }: Props) {
  const input = useRef<HTMLInputElement | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => new Date())
  const [selectedIso, setSelectedIso] = useState<string | null>(null)
  const lastYear = toYear ?? new Date().getFullYear() + 5

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const today = toDateText(new Date())

  const toggle = () => {
    if (!open) {
      const current = input.current ? parseDateText(input.current.value) : null
      setSelectedIso(current)
      if (current) {
        const [year, month] = current.split('-').map(Number) as [number, number]
        setView(new Date(year, month - 1, 1))
      } else setView(new Date())
    }
    setOpen(!open)
  }

  const pick = (date: Date) => {
    if (input.current) setNativeValue(input.current, toDateText(date))
    setOpen(false)
    input.current?.focus()
  }

  const shiftMonth = (step: number) => setView(new Date(view.getFullYear(), view.getMonth() + step, 1))
  const years = Array.from({ length: lastYear - fromYear + 1 }, (_, i) => lastYear - i)

  return (
    <div ref={wrapper} className={cn('relative', className)}>
      <MaskedInput
        {...props}
        ref={(element: HTMLInputElement | null) => {
          input.current = element
          assignRef(ref, element)
        }}
        mask={maskDate}
        placeholder={placeholder}
        disabled={disabled}
        className="pr-9"
      />
      <button
        type="button"
        aria-label="Elegir en el calendario"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50"
      >
        <CalendarDays className="size-4" aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label="Calendario" className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border bg-card p-3 shadow-lg">
          <div className="mb-2 flex items-center gap-1">
            <button type="button" aria-label="Mes anterior" onClick={() => shiftMonth(-1)} className="rounded p-1 hover:bg-muted">
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <select
              aria-label="Mes"
              value={view.getMonth()}
              onChange={(event) => setView(new Date(view.getFullYear(), Number(event.target.value), 1))}
              className="h-8 flex-1 rounded-md border bg-card px-1 text-sm capitalize"
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Año"
              value={view.getFullYear()}
              onChange={(event) => setView(new Date(Number(event.target.value), view.getMonth(), 1))}
              className="h-8 rounded-md border bg-card px-1 text-sm"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <button type="button" aria-label="Mes siguiente" onClick={() => shiftMonth(1)} className="rounded p-1 hover:bg-muted">
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs" role="grid">
            {WEEKDAYS.map((day) => (
              <span key={day} className="py-1 font-medium text-muted-foreground">
                {day}
              </span>
            ))}
            {monthGrid(view.getFullYear(), view.getMonth()).map((date, index) => {
              if (!date) return <span key={`vacio-${index}`} />
              const text = toDateText(date)
              const iso = parseDateText(text)
              return (
                <button
                  key={text}
                  type="button"
                  aria-label={text}
                  aria-pressed={iso === selectedIso}
                  onClick={() => pick(date)}
                  className={cn(
                    'rounded py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    text === today && 'font-semibold text-primary',
                    iso === selectedIso && 'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <button type="button" className="text-primary hover:underline" onClick={() => pick(new Date())}>
              Hoy
            </button>
            <button type="button" className="text-muted-foreground hover:underline" onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
