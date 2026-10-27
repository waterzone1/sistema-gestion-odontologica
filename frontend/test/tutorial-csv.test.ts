import { describe, expect, it } from 'vitest'
import { csvAmount, toCsv } from '@/lib/csv'
import { tutorialSteps } from '@/lib/tutorial'

describe('tutorial por rol', () => {
  const titulos = (permissions: Parameters<typeof tutorialSteps>[0]['permissions']) => tutorialSteps({ permissions }).map((s) => s.title)

  it('recepcion ve agenda y cobros; el odontologo ve la atencion clinica', () => {
    expect(titulos(['appointments:manage', 'payments:create'])).toEqual([
      'Bienvenido/a',
      'Menú y buscador',
      'Agenda y turnos',
      'Cobros y caja',
      'Ayuda',
    ])
    expect(titulos(['clinical:write'])).toEqual(['Bienvenido/a', 'Menú y buscador', 'Atención clínica', 'Ayuda'])
  })

  it('tiene entre 4 y 6 pasos para cada rol', () => {
    for (const permissions of [['users:manage'], ['clinical:write'], ['appointments:manage', 'payments:create']] as const) {
      const pasos = tutorialSteps({ permissions: [...permissions] }).length
      expect(pasos).toBeGreaterThanOrEqual(3)
      expect(pasos).toBeLessThanOrEqual(6)
    }
  })
})

describe('exportacion CSV', () => {
  it('separa con punto y coma, agrega BOM y protege comillas, separadores y formulas', () => {
    const csv = toCsv([
      ['Paciente', 'Saldo'],
      ['Pérez; Ana', csvAmount('1500.50')],
      ['=HYPERLINK("x")', 3],
    ])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1).split('\r\n')).toEqual(['Paciente;Saldo', '"Pérez; Ana";1500,50', `"'=HYPERLINK(""x"")";3`, ''])
  })
})
