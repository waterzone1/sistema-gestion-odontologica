import { describe, expect, it } from 'vitest'
import { dayRange, isEditable, STATUS_LABELS } from '@/lib/appointments'
import {
  formatMoney,
  formatTime,
  maskDate,
  maskTime,
  parseDateText,
  parseDateTimeText,
  toDateText,
  toTimeText,
} from '@/lib/format'
import { visibleBranches } from '@/lib/permissions'

describe('estados de turno', () => {
  it('muestra etiquetas en español para los cinco estados', () => {
    expect(Object.values(STATUS_LABELS)).toEqual(['Pendiente', 'Confirmado', 'Atendido', 'Ausente', 'Cancelado'])
  })

  it('solo se editan los pendientes y los confirmados', () => {
    expect(isEditable({ status: 'SCHEDULED' })).toBe(true)
    expect(isEditable({ status: 'CONFIRMED' })).toBe(true)
    expect(isEditable({ status: 'ATTENDED' })).toBe(false)
    expect(isEditable({ status: 'NO_SHOW' })).toBe(false)
    expect(isEditable({ status: 'CANCELLED' })).toBe(false)
  })
})

describe('dayRange', () => {
  it('cubre exactamente un dia local', () => {
    const { from, to } = dayRange(new Date(2026, 9, 2, 15, 30))
    expect(new Date(from).getHours()).toBe(0)
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(24 * 60 * 60 * 1000)
  })
})

describe('formato de fechas e importes', () => {
  it('muestra la hora en 24 horas', () => {
    expect(formatTime(new Date(2026, 9, 2, 9, 5).toISOString())).toBe('09:05')
    expect(formatTime(new Date(2026, 9, 2, 18, 45).toISOString())).toBe('18:45')
  })

  it('muestra fechas como dd/mm/aaaa y horas en 24 horas', () => {
    expect(toDateText(new Date(2026, 9, 2, 9, 5))).toBe('02/10/2026')
    expect(toTimeText(new Date(2026, 9, 2, 21, 5))).toBe('21:05')
  })

  it('agrega las barras y los dos puntos mientras se escribe', () => {
    expect(maskDate('0')).toBe('0')
    expect(maskDate('0210')).toBe('02/10')
    expect(maskDate('02102026')).toBe('02/10/2026')
    expect(maskDate('02/10/20261')).toBe('02/10/2026')
    expect(maskTime('930')).toBe('93:0')
    expect(maskTime('0930')).toBe('09:30')
  })

  it('interpreta dd/mm/aaaa y rechaza fechas inexistentes', () => {
    expect(parseDateText('02/10/2026')).toBe('2026-10-02')
    expect(parseDateText('31/02/2026')).toBeNull()
    expect(parseDateText('2026-10-02')).toBeNull()
    expect(parseDateText('2/10/2026')).toBeNull()
  })

  it('arma la fecha y hora local de un turno', () => {
    expect(parseDateTimeText('02/10/2026', '09:30')).toEqual(new Date(2026, 9, 2, 9, 30))
    expect(parseDateTimeText('02/10/2026', '24:00')).toBeNull()
    expect(parseDateTimeText('32/10/2026', '09:30')).toBeNull()
  })

  it('formatea pesos argentinos', () => {
    expect(formatMoney('25000.50').replace(/\s/g, ' ')).toBe('$ 25.000,50')
  })
})

describe('visibleBranches', () => {
  const sedes = [
    { id: 'a', active: true },
    { id: 'b', active: true },
    { id: 'c', active: false },
  ]

  it('el administrador ve todas las sedes activas', () => {
    expect(visibleBranches({ roles: ['ADMIN'], branchIds: [] }, sedes).map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('el resto solo ve las suyas', () => {
    expect(visibleBranches({ roles: ['RECEPTIONIST'], branchIds: ['b', 'c'] }, sedes).map((s) => s.id)).toEqual(['b'])
  })
})
