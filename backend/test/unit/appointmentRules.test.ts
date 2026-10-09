import { describe, expect, it } from 'vitest'
import {
  canTransition,
  isEditable,
  type AppointmentStatus,
} from '../../src/modules/appointments/domain/status.js'
import { rangeProblem } from '../../src/modules/appointments/domain/timeRange.js'

const ESTADOS: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED']

describe('canTransition', () => {
  it.each([
    ['SCHEDULED', 'CONFIRMED'],
    ['SCHEDULED', 'ATTENDED'],
    ['SCHEDULED', 'NO_SHOW'],
    ['SCHEDULED', 'CANCELLED'],
    ['CONFIRMED', 'ATTENDED'],
    ['CONFIRMED', 'NO_SHOW'],
    ['CONFIRMED', 'CANCELLED'],
  ] as const)('permite %s -> %s', (desde, hacia) => {
    expect(canTransition(desde, hacia)).toBe(true)
  })

  it('no vuelve a pendiente ni confirma dos veces', () => {
    expect(canTransition('CONFIRMED', 'SCHEDULED')).toBe(false)
    expect(canTransition('CONFIRMED', 'CONFIRMED')).toBe(false)
  })

  it.each(['ATTENDED', 'NO_SHOW', 'CANCELLED'] as const)('%s es un estado final', (final) => {
    for (const destino of ESTADOS) expect(canTransition(final, destino)).toBe(false)
  })
})

describe('isEditable', () => {
  it('solo los turnos pendientes o confirmados se pueden modificar', () => {
    expect(ESTADOS.filter(isEditable)).toEqual(['SCHEDULED', 'CONFIRMED'])
  })
})

describe('rangeProblem', () => {
  const inicio = new Date('2026-10-05T12:00:00Z')
  const despues = (minutos: number) => new Date(inicio.getTime() + minutos * 60_000)

  it('acepta duraciones razonables', () => {
    expect(rangeProblem(inicio, despues(30))).toBeNull()
    expect(rangeProblem(inicio, despues(5))).toBeNull()
    expect(rangeProblem(inicio, despues(480))).toBeNull()
  })

  it('rechaza rangos vacios o invertidos', () => {
    expect(rangeProblem(inicio, inicio)).not.toBeNull()
    expect(rangeProblem(inicio, despues(-10))).not.toBeNull()
  })

  it('rechaza turnos demasiado cortos o demasiado largos', () => {
    expect(rangeProblem(inicio, despues(4))).toMatch(/al menos 5/)
    expect(rangeProblem(inicio, despues(481))).toMatch(/8 horas/)
  })

  it('rechaza fechas invalidas', () => {
    expect(rangeProblem(new Date('x'), inicio)).not.toBeNull()
  })
})
