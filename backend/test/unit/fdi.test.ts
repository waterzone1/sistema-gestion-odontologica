import { describe, expect, it } from 'vitest'
import {
  currentState,
  findingProblem,
  isValidTooth,
  type Condition,
  type Finding,
  type Surface,
} from '../../src/modules/odontogram/domain/fdi.js'

let minuto = 0
const hallazgo = (tooth: number, condition: Condition, surface: Surface | null = null): Finding => ({
  tooth,
  surface,
  condition,
  createdAt: new Date(Date.UTC(2026, 9, 1, 10, (minuto += 1))),
})

describe('numeracion FDI', () => {
  it('acepta permanentes 11 a 48 y temporales 51 a 85', () => {
    for (const pieza of [11, 18, 21, 28, 31, 38, 41, 48, 51, 55, 61, 65, 71, 75, 81, 85]) {
      expect(isValidTooth(pieza)).toBe(true)
    }
  })

  it('rechaza piezas que no existen', () => {
    for (const pieza of [0, 10, 19, 49, 56, 66, 76, 86, 91, 110]) expect(isValidTooth(pieza)).toBe(false)
  })
})

describe('findingProblem', () => {
  it('las condiciones de pieza completa no llevan superficies', () => {
    expect(findingProblem(16, 'CROWN', ['O'])).toMatch(/pieza completa/)
    expect(findingProblem(16, 'MISSING', [])).toBeNull()
  })

  it('las condiciones de superficie aceptan una o varias, sin repetir', () => {
    expect(findingProblem(16, 'CARIES', ['O', 'M'])).toBeNull()
    expect(findingProblem(16, 'CARIES', ['O', 'O'])).toMatch(/repetidas/)
    expect(findingProblem(99, 'CARIES', ['O'])).toMatch(/FDI/)
  })
})

describe('currentState', () => {
  it('se queda con lo ultimo registrado en cada superficie', () => {
    const estado = currentState([hallazgo(16, 'CARIES', 'O'), hallazgo(16, 'RESTORATION', 'O'), hallazgo(16, 'CARIES', 'M')])
    expect(estado.map((h) => [h.tooth, h.surface, h.condition])).toEqual([
      [16, 'M', 'CARIES'],
      [16, 'O', 'RESTORATION'],
    ])
  })

  it('marcar sano una superficie la limpia', () => {
    expect(currentState([hallazgo(26, 'CARIES', 'D'), hallazgo(26, 'HEALTHY', 'D')])).toEqual([])
  })

  it('una condicion de pieza completa reemplaza lo anterior de esa pieza', () => {
    const estado = currentState([hallazgo(36, 'CARIES', 'O'), hallazgo(36, 'MISSING'), hallazgo(37, 'SEALANT', 'O')])
    expect(estado.map((h) => [h.tooth, h.surface, h.condition])).toEqual([
      [36, null, 'MISSING'],
      [37, 'O', 'SEALANT'],
    ])
  })

  it('el historial no se pierde: el estado es solo una vista de lo registrado', () => {
    const historial = [hallazgo(11, 'FRACTURE', 'O'), hallazgo(11, 'HEALTHY')]
    expect(currentState(historial)).toEqual([])
    expect(historial).toHaveLength(2)
  })
})
