import type { AgendaAvailability, Appointment, AppointmentStatus, Professional } from './api'
import { isEditable } from './appointments'
import { EXCEPTION_LABELS } from './availability'
import { toIsoDay } from './format'

export type StatusFilter = AppointmentStatus | 'ACTIVE' | ''

export function allDaySpan(startIso: string, endIso: string): { start: string; end: string } {
  const last = new Date(new Date(endIso).getTime() - 1)
  const after = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1)
  return { start: toIsoDay(new Date(startIso)), end: toIsoDay(after) }
}

const colorClass = (professional: Professional | undefined) => `fc-pro-${professional?.color ?? 'none'}`

export function matchesStatus(appointment: Pick<Appointment, 'status'>, filter: StatusFilter): boolean {
  if (filter === 'ACTIVE') return appointment.status !== 'CANCELLED' && appointment.status !== 'NO_SHOW'
  return filter === '' || appointment.status === filter
}

export function appointmentEvents(
  appointments: Appointment[],
  professionals: Professional[],
  filter: StatusFilter,
  canManage: boolean,
) {
  const byId = new Map(professionals.map((p) => [p.id, p]))
  return appointments
    .filter((a) => matchesStatus(a, filter))
    .map((a) => ({
      id: a.id,
      start: a.startsAt,
      end: a.endsAt,
      title: a.patient.fullName,
      classNames: ['fc-turno', `fc-estado-${a.status.toLowerCase()}`, colorClass(byId.get(a.professional.id))],
      editable: canManage && isEditable(a),
      extendedProps: { appointment: a },
    }))
}

export function availabilityEvents(availability: AgendaAvailability) {
  return availability.flatMap((professional) => [
    ...professional.available.map((interval) => ({
      start: interval.start,
      end: interval.end,
      display: 'background' as const,
      classNames: ['fc-disponible'],
    })),
    ...professional.blocked.map((interval) => ({
      start: interval.start,
      end: interval.end,
      display: 'background' as const,
      classNames: ['fc-bloqueado'],
      title: `${EXCEPTION_LABELS[interval.type]}: ${interval.reason}`,
    })),
  ])
}

export function noticeEvents(availability: AgendaAvailability, professionals: Professional[]) {
  const byId = new Map(professionals.map((p) => [p.id, p]))
  return availability.flatMap((entry) => {
    const professional = byId.get(entry.professionalId)
    return entry.blocked.map((interval) => ({
      ...allDaySpan(interval.start, interval.end),
      allDay: true,
      title: `${professional?.displayName ?? 'Profesional'} · ${EXCEPTION_LABELS[interval.type]}`,
      classNames: ['fc-aviso', colorClass(professional)],
      extendedProps: { notice: interval.reason },
    }))
  })
}

export function availableIntervals(availability: AgendaAvailability | undefined): Pick<Appointment, 'startsAt'>[] {
  return (availability ?? []).flatMap((professional) => professional.available.map((interval) => ({ startsAt: interval.start })))
}

export function hiddenDays(
  preferences: { showSaturday: boolean; showSunday: boolean },
  appointments: readonly Pick<Appointment, 'startsAt'>[] = [],
): number[] {
  const busy = new Set(appointments.map((a) => new Date(a.startsAt).getDay()))
  return [...(preferences.showSunday ? [] : [0]), ...(preferences.showSaturday ? [] : [6])].filter((day) => !busy.has(day))
}
