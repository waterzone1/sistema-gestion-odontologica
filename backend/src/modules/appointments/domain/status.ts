export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'ATTENDED' | 'NO_SHOW' | 'CANCELLED'

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  SCHEDULED: ['CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED'],
  CONFIRMED: ['ATTENDED', 'NO_SHOW', 'CANCELLED'],
  ATTENDED: [],
  NO_SHOW: [],
  CANCELLED: [],
}

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function isEditable(status: AppointmentStatus): boolean {
  return status === 'SCHEDULED' || status === 'CONFIRMED'
}
