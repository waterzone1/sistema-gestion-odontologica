import { describe, expect, it } from 'vitest'
import type { Odontogram } from '@/lib/api'
import { CONDITION_LABELS, PERMANENT_ROWS, surfaceAt, TEMPORARY_ROWS, toothViews } from '@/lib/odontogram'

const hallazgo = (tooth: number, condition: Odontogram['current'][number]['condition'], surface: Odontogram['current'][number]['surface'] = null) => ({
  id: `${tooth}-${surface ?? 'x'}`,
  tooth,
  surface,
  condition,
  note: null,
  professional: { id: 'p', displayName: 'Dra. Paz' },
  createdAt: '2026-10-12T12:00:00.000Z',
})

describe('arcadas FDI', () => {
  it('dibuja 32 permanentes y 20 temporales, sin repetir', () => {
    expect(new Set(PERMANENT_ROWS.flat()).size).toBe(32)
    expect(new Set(TEMPORARY_ROWS.flat()).size).toBe(20)
  })
})

describe('superficies en el dibujo', () => {
  it('arriba es vestibular en el maxilar superior y lingual en el inferior', () => {
    expect(surfaceAt(16, 'top')).toBe('V')
    expect(surfaceAt(16, 'bottom')).toBe('L')
    expect(surfaceAt(36, 'top')).toBe('L')
    expect(surfaceAt(36, 'bottom')).toBe('V')
    expect(surfaceAt(36, 'center')).toBe('O')
  })

  it('mesial mira siempre hacia la línea media', () => {
    expect(surfaceAt(16, 'right')).toBe('M')
    expect(surfaceAt(16, 'left')).toBe('D')
    expect(surfaceAt(26, 'left')).toBe('M')
    expect(surfaceAt(46, 'right')).toBe('M')
    expect(surfaceAt(36, 'left')).toBe('M')
    expect(surfaceAt(55, 'right')).toBe('M')
    expect(surfaceAt(75, 'left')).toBe('M')
  })
})

describe('toothViews', () => {
  it('separa superficies de condiciones de pieza completa', () => {
    const vistas = toothViews([hallazgo(16, 'CARIES', 'O'), hallazgo(16, 'CROWN'), hallazgo(21, 'FRACTURE')])
    expect(vistas.get(16)).toEqual({ surfaces: { O: 'CARIES' }, whole: ['CROWN'] })
    expect(Object.keys(vistas.get(21)?.surfaces ?? {})).toHaveLength(5)
  })

  it('tiene nombre en español para cada condición', () => {
    expect(CONDITION_LABELS.EXTRACTION_INDICATED).toBe('Extracción indicada')
    expect(Object.keys(CONDITION_LABELS)).toHaveLength(12)
  })
})
