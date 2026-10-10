import { describe, expect, it } from 'vitest'
import {
  addDays,
  checkAvailability,
  expandRules,
  fromLocal,
  rulesProblem,
  toLocal,
  type Exception,
  type Rule,
} from '../../src/modules/availability/domain/availability.js'

const TZ = 'America/Argentina/Buenos_Aires'
const SEDE = 'sede-a'
const OTRA = 'sede-b'
const at = (iso: string) => new Date(iso)

const manana: Rule = { branchId: SEDE, weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60 }
const tarde: Rule = { branchId: SEDE, weekday: 1, startMinute: 12 * 60, endMinute: 18 * 60 }
const martesOtraSede: Rule = { branchId: OTRA, weekday: 2, startMinute: 8 * 60, endMinute: 13 * 60 }

const resultado = (inicio: string, fin: string, extra: Partial<Parameters<typeof checkAvailability>[0]> = {}) =>
  checkAvailability({
    startsAt: at(inicio),
    endsAt: at(fin),
    branchId: SEDE,
    rules: [manana, tarde, martesOtraSede],
    exceptions: [],
    timeZone: TZ,
    ...extra,
  })

describe('zona horaria del consultorio', () => {
  it('convierte entre UTC y hora local de Buenos Aires', () => {
    expect(toLocal(at('2026-10-12T12:30:00Z'), TZ)).toEqual({ day: '2026-10-12', weekday: 1, minute: 9 * 60 + 30 })
    expect(toLocal(at('2026-10-12T02:00:00Z'), TZ)).toEqual({ day: '2026-10-11', weekday: 7, minute: 23 * 60 })
    expect(fromLocal('2026-10-12', 9 * 60 + 30, TZ).toISOString()).toBe('2026-10-12T12:30:00.000Z')
    expect(fromLocal('2026-10-12', 1440, TZ).toISOString()).toBe('2026-10-13T03:00:00.000Z')
  })

  it('suma dias a una fecha local', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('rulesProblem', () => {
  it('acepta franjas validas y contiguas', () => {
    expect(rulesProblem([manana, tarde, martesOtraSede])).toBeNull()
  })

  it('rechaza franjas invertidas, fuera del dia o con dia invalido', () => {
    expect(rulesProblem([{ ...manana, startMinute: 600, endMinute: 500 }])).not.toBeNull()
    expect(rulesProblem([{ ...manana, endMinute: 1441 }])).not.toBeNull()
    expect(rulesProblem([{ ...manana, weekday: 8 }])).not.toBeNull()
  })

  it('rechaza franjas superpuestas el mismo dia aunque sean de sedes distintas', () => {
    expect(rulesProblem([manana, { branchId: OTRA, weekday: 1, startMinute: 11 * 60, endMinute: 13 * 60 }])).toBe(
      'Hay franjas que se superponen en el mismo día',
    )
  })
})

const chequear = (...args: Parameters<typeof resultado>) => {
  const { blocked, warning } = resultado(...args)
  return blocked ?? warning
}

describe('checkAvailability', () => {
  it('separa lo que bloquea (ausencias) de lo que solo advierte (fuera de horario)', () => {
    const vacaciones: Exception = { type: 'VACATION', branchId: null, startsAt: at('2026-10-12T00:00:00Z'), endsAt: at('2026-10-13T00:00:00Z') }
    expect(resultado('2026-10-12T21:30:00Z', '2026-10-12T22:00:00Z')).toEqual({
      blocked: null,
      warning: 'Fuera del horario de atención del profesional en esa sede',
    })
    expect(resultado('2026-10-12T12:00:00Z', '2026-10-12T12:30:00Z', { exceptions: [vacaciones] }).blocked).toMatch(/vacaciones/)
    expect(resultado('2026-10-12T12:00:00Z', '2026-10-12T12:30:00Z')).toEqual({ blocked: null, warning: null })
  })

  it('permite un turno dentro del horario', () => {
    expect(chequear('2026-10-12T12:00:00Z', '2026-10-12T12:30:00Z')).toBeNull()
  })

  it('permite un turno que cruza dos franjas contiguas', () => {
    expect(chequear('2026-10-12T14:30:00Z', '2026-10-12T15:30:00Z')).toBeNull()
  })

  it('rechaza un turno fuera del horario o en otro dia', () => {
    expect(chequear('2026-10-12T21:30:00Z', '2026-10-12T22:00:00Z')).toBe(
      'Fuera del horario de atención del profesional en esa sede',
    )
    expect(chequear('2026-10-14T12:00:00Z', '2026-10-14T12:30:00Z')).not.toBeNull()
  })

  it('rechaza un turno en una sede donde ese dia no atiende', () => {
    expect(chequear('2026-10-13T12:00:00Z', '2026-10-13T12:30:00Z')).not.toBeNull()
    expect(chequear('2026-10-13T12:00:00Z', '2026-10-13T12:30:00Z', { branchId: OTRA })).toBeNull()
  })

  it('rechaza turnos que pasan de un dia a otro', () => {
    const veinticuatro: Rule = { branchId: SEDE, weekday: 1, startMinute: 0, endMinute: 1440 }
    const martes: Rule = { branchId: SEDE, weekday: 2, startMinute: 0, endMinute: 1440 }
    expect(
      chequear('2026-10-13T02:30:00Z', '2026-10-13T03:30:00Z', { rules: [veinticuatro, martes] }),
    ).toBe('El turno pasa de un día a otro')
  })

  it('un turno que termina justo a la medianoche entra en la franja hasta las 24', () => {
    const veinticuatro: Rule = { branchId: SEDE, weekday: 1, startMinute: 0, endMinute: 1440 }
    expect(chequear('2026-10-13T02:30:00Z', '2026-10-13T03:00:00Z', { rules: [veinticuatro] })).toBeNull()
  })

  it('las vacaciones, ausencias y bloqueos impiden el turno aunque este en horario', () => {
    for (const type of ['VACATION', 'ABSENCE', 'BLOCK'] as const) {
      const bloqueo: Exception = { type, branchId: null, startsAt: at('2026-10-12T00:00:00Z'), endsAt: at('2026-10-19T00:00:00Z') }
      expect(chequear('2026-10-12T12:00:00Z', '2026-10-12T12:30:00Z', { exceptions: [bloqueo] })).toMatch(
        /^El profesional no atiende en ese horario/,
      )
    }
  })

  it('un bloqueo de otra sede no afecta', () => {
    const bloqueo: Exception = { type: 'BLOCK', branchId: OTRA, startsAt: at('2026-10-12T12:00:00Z'), endsAt: at('2026-10-12T13:00:00Z') }
    expect(chequear('2026-10-12T12:00:00Z', '2026-10-12T12:30:00Z', { exceptions: [bloqueo] })).toBeNull()
  })

  it('un horario extraordinario habilita turnos fuera de la grilla semanal', () => {
    const extra: Exception = { type: 'EXTRA', branchId: SEDE, startsAt: at('2026-10-17T12:00:00Z'), endsAt: at('2026-10-17T16:00:00Z') }
    expect(chequear('2026-10-17T13:00:00Z', '2026-10-17T13:30:00Z')).not.toBeNull()
    expect(chequear('2026-10-17T13:00:00Z', '2026-10-17T13:30:00Z', { exceptions: [extra] })).toBeNull()
    expect(chequear('2026-10-17T15:30:00Z', '2026-10-17T16:30:00Z', { exceptions: [extra] })).not.toBeNull()
    expect(chequear('2026-10-17T13:00:00Z', '2026-10-17T13:30:00Z', { exceptions: [extra], branchId: OTRA })).not.toBeNull()
  })
})

describe('expandRules', () => {
  it('genera las franjas concretas de un rango en hora local', () => {
    const franjas = expandRules([manana, martesOtraSede], at('2026-10-12T03:00:00Z'), at('2026-10-14T03:00:00Z'), TZ)
    expect(franjas.map((f) => [f.start.toISOString(), f.end.toISOString(), f.branchId])).toEqual([
      ['2026-10-12T12:00:00.000Z', '2026-10-12T15:00:00.000Z', SEDE],
      ['2026-10-13T11:00:00.000Z', '2026-10-13T16:00:00.000Z', OTRA],
    ])
  })
})
