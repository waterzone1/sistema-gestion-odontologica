import type { Appointment, AppointmentStatus } from './api'

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Pendiente',
  CONFIRMED: 'Confirmado',
  ATTENDED: 'Atendido',
  NO_SHOW: 'Ausente',
  CANCELLED: 'Cancelado',
}

export const STATUS_VARIANT: Record<AppointmentStatus, 'default' | 'success' | 'muted' | 'destructive'> = {
  SCHEDULED: 'default',
  CONFIRMED: 'success',
  ATTENDED: 'muted',
  NO_SHOW: 'destructive',
  CANCELLED: 'muted',
}

export function isEditable(appointment: Pick<Appointment, 'status'>): boolean {
  return appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED'
}

export function dayRange(date: Date): { from: string; to: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}
