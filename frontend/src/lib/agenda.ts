import type { AgendaAvailability, Appointment, AppointmentStatus, Professional } from './api'
import { isEditable } from './appointments'
import { EXCEPTION_LABELS } from './availability'

export type StatusFilter = AppointmentStatus | 'ACTIVE' | ''

const pad = (value: number) => String(value).padStart(2, '0')

function localIsoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function allDaySpan(startIso: string, endIso: string): { start: string; end: string } {
  const last = new Date(new Date(endIso).getTime() - 1)
  const after = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1)
  return { start: localIsoDay(new Date(startIso)), end: localIsoDay(after) }
}

const colorClass = (professional: Professional | undefined) => `fc-pro-${professional?.color ?? 'none'}`

export function matchesStatus(appointment: Pick<Appointment, 'status'>, filter: StatusFilter): boolean {
  if (filter === 'ACTIVE') return appointment.status !== 'CANCELLED'
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
