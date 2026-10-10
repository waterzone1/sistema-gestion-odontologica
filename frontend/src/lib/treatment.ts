import type { TreatmentPlan } from './api'
import { PERMANENT_ROWS, TEMPORARY_ROWS } from './odontogram'

type PlanStatus = TreatmentPlan['status']
type ItemStatus = TreatmentPlan['items'][number]['status']

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  DRAFT: 'Presupuesto sin aceptar',
  ACCEPTED: 'Presupuesto aceptado',
  COMPLETED: 'Terminado',
  CANCELLED: 'Cancelado',
}

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  PLANNED: 'Pendiente',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Realizado',
  CANCELLED: 'Cancelado',
}

export const TOOTH_OPTIONS: number[] = [...PERMANENT_ROWS.flat(), ...TEMPORARY_ROWS.flat()].sort((a, b) => a - b)

export function isOpenItem(item: Pick<TreatmentPlan['items'][number], 'status'>): boolean {
  return item.status === 'PLANNED' || item.status === 'IN_PROGRESS'
}

export function itemLocation(item: Pick<TreatmentPlan['items'][number], 'tooth' | 'surfaces'>): string | null {
  if (item.tooth === null) return null
  return item.surfaces.length > 0 ? `Pieza ${item.tooth} (${item.surfaces.join(', ')})` : `Pieza ${item.tooth}`
}
