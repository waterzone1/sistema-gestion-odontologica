import { describe, expect, it } from 'vitest'
import { draftProblem, EXCEPTION_LABELS, WEEKDAYS } from '@/lib/availability'

const franja = (extra: Partial<Parameters<typeof draftProblem>[0][number]> = {}) => ({
  key: 0,
  branchId: 'sede',
  weekday: 1,
  start: '09:00',
  end: '13:00',
  ...extra,
})

describe('validacion del horario semanal', () => {
  it('acepta franjas contiguas y en distintos dias', () => {
    expect(
      draftProblem([franja(), franja({ key: 1, start: '13:00', end: '18:00' }), franja({ key: 2, weekday: 2 })]),
    ).toBeNull()
  })

  it('acepta una franja hasta las 24', () => {
    expect(draftProblem([franja({ start: '00:00', end: '24:00' })])).toBeNull()
  })

  it('detecta superposiciones, horas invalidas, franjas invertidas y sede faltante', () => {
    expect(draftProblem([franja(), franja({ key: 1, start: '12:00', end: '14:00' })])).toMatch(/superponen/)
    expect(draftProblem([franja({ start: '9:00' })])).toMatch(/hh:mm/)
    expect(draftProblem([franja({ start: '25:00' })])).toMatch(/hh:mm/)
    expect(draftProblem([franja({ start: '13:00', end: '09:00' })])).toMatch(/terminar después/)
    expect(draftProblem([franja({ branchId: '' })])).toMatch(/sede/)
  })
})

describe('etiquetas', () => {
  it('lista la semana de lunes a domingo', () => {
    expect(WEEKDAYS.map((d) => d.value)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(WEEKDAYS[0].label).toBe('Lunes')
  })

  it('nombra los cuatro tipos de excepcion en español', () => {
    expect(Object.values(EXCEPTION_LABELS)).toEqual(['Bloqueo', 'Vacaciones', 'Ausencia', 'Horario extraordinario'])
  })
})
