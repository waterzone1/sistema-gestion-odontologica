import { describe, expect, it } from 'vitest'
import { scheduleSummary } from '@/components/backups/backup-settings'
import { previewMessage } from '@/components/settings/organization-settings'
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
    expect(titulos(ONBOARDING_TOUR, [])).toContain('Accesos rápidos')
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

describe('ajustes del consultorio', () => {
  it('resume la frecuencia del backup automatico', () => {
    const base = { schedule: 'DAILY' as const, hour: 3, weekday: 7, paused: false, keepDaily: 7, keepWeekly: 4, keepManual: 10 }
    expect(scheduleSummary(base)).toBe('Todos los días a las 03:00.')
    expect(scheduleSummary({ ...base, schedule: 'EVERY_6H', hour: 2 })).toBe('Todos los días a las 02:00, 08:00, 14:00, 20:00.')
    expect(scheduleSummary({ ...base, schedule: 'WEEKLY' })).toBe('Los domingos a las 03:00.')
    expect(scheduleSummary({ ...base, paused: true })).toBe('El backup automático está en pausa.')
  })

  it('muestra el mensaje del recordatorio con datos de ejemplo', () => {
    expect(previewMessage('Hola {nombre}, te espera {profesional} en {consultorio}. {otra}', 'Sonrisas')).toBe('Hola Ana, te espera Dra. Paz en Sonrisas. {otra}')
  })
})
