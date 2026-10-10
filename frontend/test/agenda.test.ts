import { describe, expect, it } from 'vitest'
import { allDaySpan, appointmentEvents, matchesStatus, noticeEvents } from '@/lib/agenda'
import type { AgendaAvailability, Appointment, Professional } from '@/lib/api'
import { resolveDark } from '@/lib/theme'

const profesional = (extra: Partial<Professional> = {}): Professional => ({
  id: 'pro-1',
  userId: 'user-1',
  displayName: 'Dra. Paz',
  licenseNumber: 'MP-1',
  phone: null,
  email: null,
  color: 'violet',
  practiceIds: [],
  active: true,
  branchIds: ['sede'],
  ...extra,
})

const turno = (status: Appointment['status']): Appointment => ({
  id: `turno-${status}`,
  status,
  startsAt: new Date(2026, 9, 12, 10).toISOString(),
  endsAt: new Date(2026, 9, 12, 10, 30).toISOString(),
  notes: null,
  cancellationReason: null,
  branch: { id: 'sede', name: 'Central' },
  patient: { id: 'pac', fullName: 'Rossi, Luca', phone: null },
  professional: { id: 'pro-1', userId: 'user-1', displayName: 'Dra. Paz' },
  practice: null,
  hasClinicalNote: null,
  availabilityOverride: false,
  overrideReason: null,
  createdAt: new Date(2026, 9, 1).toISOString(),
})

describe('filtro de estado de la agenda', () => {
  it('por defecto oculta solo los cancelados', () => {
    expect(matchesStatus({ status: 'CANCELLED' }, 'ACTIVE')).toBe(false)
    expect(matchesStatus({ status: 'ATTENDED' }, 'ACTIVE')).toBe(true)
    expect(matchesStatus({ status: 'CANCELLED' }, '')).toBe(true)
    expect(matchesStatus({ status: 'NO_SHOW' }, 'CONFIRMED')).toBe(false)
  })
})

describe('eventos de turnos', () => {
  it('llevan el color del profesional y el estado, y solo se arrastran si siguen vigentes', () => {
    const eventos = appointmentEvents([turno('SCHEDULED'), turno('ATTENDED')], [profesional()], 'ACTIVE', true)
    expect(eventos.map((e) => e.classNames)).toEqual([
      ['fc-turno', 'fc-estado-scheduled', 'fc-pro-violet'],
      ['fc-turno', 'fc-estado-attended', 'fc-pro-violet'],
    ])
    expect(eventos.map((e) => e.editable)).toEqual([true, false])
  })

  it('sin color elegido usa el color por defecto y sin permiso no se arrastra', () => {
    const [evento] = appointmentEvents([turno('CONFIRMED')], [profesional({ color: null })], 'ACTIVE', false)
    expect(evento?.classNames).toContain('fc-pro-none')
    expect(evento?.editable).toBe(false)
  })
})

describe('avisos de excepciones', () => {
  it('muestra un aviso por dia completo con el nombre del profesional', () => {
    const disponibilidad: AgendaAvailability = [
      {
        professionalId: 'pro-1',
        available: [],
        blocked: [
          {
            start: new Date(2026, 9, 12, 0, 0).toISOString(),
            end: new Date(2026, 9, 14, 0, 0).toISOString(),
            branchId: null,
            type: 'VACATION',
            reason: 'Congreso',
          },
        ],
      },
    ]
    const [aviso] = noticeEvents(disponibilidad, [profesional()])
    expect(aviso).toMatchObject({
      start: '2026-10-12',
      end: '2026-10-14',
      allDay: true,
      title: 'Dra. Paz · Vacaciones',
      classNames: ['fc-aviso', 'fc-pro-violet'],
    })
  })

  it('un bloqueo de unas horas ocupa solo ese dia', () => {
    expect(
      allDaySpan(new Date(2026, 9, 12, 15).toISOString(), new Date(2026, 9, 12, 16).toISOString()),
    ).toEqual({ start: '2026-10-12', end: '2026-10-13' })
  })
})

describe('tema', () => {
  it('respeta la eleccion del usuario o la del sistema', () => {
    expect(resolveDark('DARK', false)).toBe(true)
    expect(resolveDark('LIGHT', true)).toBe(false)
    expect(resolveDark('SYSTEM', true)).toBe(true)
    expect(resolveDark('SYSTEM', false)).toBe(false)
  })
})
