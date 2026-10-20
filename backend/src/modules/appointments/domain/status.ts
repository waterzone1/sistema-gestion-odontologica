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

export function canReactivate(status: AppointmentStatus): boolean {
  return status === 'CANCELLED' || status === 'NO_SHOW'
}

export type BillingState = 'NOT_APPLICABLE' | 'PENDING' | 'SERVICE' | 'TREATMENT_SESSION' | 'NO_CHARGE'

export function billingState(
  status: AppointmentStatus,
  activeServices: number,
  closureKind: 'TREATMENT_SESSION' | 'NO_CHARGE' | null,
): BillingState {
  if (status !== 'ATTENDED') return 'NOT_APPLICABLE'
  if (activeServices > 0) return 'SERVICE'
  return closureKind ?? 'PENDING'
}

export function isEditable(status: AppointmentStatus): boolean {
  return status === 'SCHEDULED' || status === 'CONFIRMED'
}
