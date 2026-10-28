import { describe, expect, it } from 'vitest'
import { monthGrid } from '@/components/ui/date-input'
import { csvAmount, toCsv } from '@/lib/csv'
import { ONBOARDING_TOUR, TOUR_IDS, tourForPath, tourSteps } from '@/lib/tours'

describe('recorridos guiados', () => {
  const titulos = (id: string, permissions: Parameters<typeof tourSteps>[1]['permissions']) => tourSteps(id, { permissions }).map((s) => s.title)

  it('cada pantalla tiene su recorrido y el general va primero', () => {
    expect(tourForPath('/agenda')).toBe('agenda')
    expect(tourForPath('/patients/0190')).toBe('patient')
    expect(tourForPath('/patients')).toBe('patients')
    expect(tourForPath('/patients/import')).toBeNull()
    expect(tourForPath('/admin/audit')).toBe('audit')
    expect(TOUR_IDS[0]).toBe(ONBOARDING_TOUR)
  })

  it('los pasos dependen de los permisos del rol', () => {
    expect(titulos('agenda', ['appointments:read'])).not.toContain('Dar un turno')
    expect(titulos('agenda', ['appointments:read', 'appointments:manage'])).toContain('Dar un turno')
    expect(titulos(ONBOARDING_TOUR, [])).not.toContain('Buscador de pacientes')
    expect(titulos('settings', ['organization:manage'])).toContain('Módulos')
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

describe('calendario de fechas', () => {
  it('arma el mes empezando en lunes y completa semanas enteras', () => {
    const noviembre = monthGrid(2026, 10)
    expect(noviembre.length % 7).toBe(0)
    expect(noviembre.slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(noviembre[6]?.getDate()).toBe(1)
    expect(noviembre.filter(Boolean)).toHaveLength(30)
  })
})
