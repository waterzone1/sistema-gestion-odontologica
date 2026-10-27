import { describe, expect, it } from 'vitest'
import { FILE_CATEGORY_LABELS, fileProblem, formatBytes } from '@/lib/files'

describe('archivos clinicos', () => {
  it('acepta PDF, JPG y PNG de hasta 20 MB', () => {
    expect(fileProblem({ name: 'rx.PNG', size: 1000 })).toBeNull()
    expect(fileProblem({ name: 'estudio.pdf', size: 20 * 1024 * 1024 })).toBeNull()
    expect(fileProblem({ name: 'foto.jpeg', size: 10 })).toBeNull()
  })

  it('rechaza otros formatos, vacíos o demasiado grandes', () => {
    expect(fileProblem({ name: 'planilla.xlsx', size: 10 })).toMatch(/PDF, JPG o PNG/)
    expect(fileProblem({ name: 'vacio.pdf', size: 0 })).toMatch(/vacío/)
    expect(fileProblem({ name: 'grande.pdf', size: 20 * 1024 * 1024 + 1 })).toMatch(/20 MB/)
  })

  it('muestra tamaños legibles y categorías en español', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5,0 MB')
    expect(Object.values(FILE_CATEGORY_LABELS)).toEqual(['Radiografía', 'Estudio', 'Foto', 'Consentimiento', 'Otro'])
  })
})
