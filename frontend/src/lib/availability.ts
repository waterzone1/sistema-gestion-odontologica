import type { AvailabilityException } from './api'

export const WEEKDAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
] as const

export const EXCEPTION_LABELS: Record<AvailabilityException['type'], string> = {
  BLOCK: 'Bloqueo',
  VACATION: 'Vacaciones',
  ABSENCE: 'Ausencia',
  EXTRA: 'Horario extraordinario',
}

const TIME = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/

export interface DraftRule {
  key: number
  branchId: string
  weekday: number
  start: string
  end: string
}

export function draftProblem(rules: readonly DraftRule[]): string | null {
  for (const rule of rules) {
    if (!rule.branchId) return 'Elegí la sede de cada franja'
    if (!TIME.test(rule.start) || !TIME.test(rule.end)) return 'Usá el formato hh:mm (24 h) en todas las franjas'
    if (rule.start >= rule.end) return 'Cada franja debe terminar después de empezar'
  }
  const sorted = [...rules].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1] as DraftRule
    const current = sorted[i] as DraftRule
    if (previous.weekday === current.weekday && current.start < previous.end) {
      return 'Hay franjas que se superponen en el mismo día'
    }
  }
  return null
}
