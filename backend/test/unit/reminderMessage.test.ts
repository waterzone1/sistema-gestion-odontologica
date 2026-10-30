import { describe, expect, it } from 'vitest'
import { backupSlots, DEFAULT_SETTINGS, DEFAULT_TEMPLATE, readSettings, renderTemplate } from '../../src/modules/organizations/domain/settings.js'
import { whatsappLink, whatsappNumber } from '../../src/modules/reminders/domain/message.js'

describe('numero de WhatsApp argentino', () => {
  it('normaliza celulares con o sin prefijos', () => {
    expect(whatsappNumber('11 5555-1234')).toBe('5491155551234')
    expect(whatsappNumber('011 15 5555-1234')).toBe('5491155551234')
    expect(whatsappNumber('+54 9 11 5555-1234')).toBe('5491155551234')
    expect(whatsappNumber('+54 11 5555 1234')).toBe('5491155551234')
    expect(whatsappNumber('0351 15 444-9999')).toBe('5493514449999')
  })

  it('no arma link si el numero no alcanza', () => {
    expect(whatsappNumber('4444')).toBeNull()
    expect(whatsappNumber(null)).toBeNull()
    expect(whatsappLink(null, 'hola')).toBeNull()
  })

  it('el link lleva el mensaje codificado', () => {
    const mensaje = renderTemplate(DEFAULT_TEMPLATE, {
      nombre: 'Ana',
      fecha: '28/10/2026',
      hora: '10:30',
      profesional: 'Dra. Paz',
      sede: 'Centro',
      consultorio: 'Consultorio Sonrisas',
    })
    expect(mensaje).toContain('turno del 28/10/2026 a las 10:30 con Dra. Paz')
    expect(whatsappLink('11 5555-1234', mensaje)).toMatch(/^https:\/\/wa\.me\/5491155551234\?text=Hola%20Ana/)
  })
})

describe('ajustes de la organizacion', () => {
  const zona = 'America/Argentina/Buenos_Aires'
  const base = DEFAULT_SETTINGS.backups

  it('completa lo que falta con los valores por defecto y descarta lo invalido', () => {
    const leidos = readSettings({ reminders: { daysAhead: 9, template: 'x' }, files: { maxMb: 5 } })
    expect(leidos.reminders).toEqual(DEFAULT_SETTINGS.reminders)
    expect(leidos.files).toEqual({ maxMb: 5 })
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('calcula el ultimo y el proximo horario de backup segun la frecuencia', () => {
    const ahora = new Date('2026-10-29T13:30:00-03:00')
    const diario = backupSlots(base, ahora, zona)
    expect(diario.latest?.toISOString()).toBe(new Date('2026-10-29T03:00:00-03:00').toISOString())
    expect(diario.next?.toISOString()).toBe(new Date('2026-10-30T03:00:00-03:00').toISOString())
    const seis = backupSlots({ ...base, schedule: 'EVERY_6H' }, ahora, zona)
    expect(seis.latest?.toISOString()).toBe(new Date('2026-10-29T09:00:00-03:00').toISOString())
    expect(seis.next?.toISOString()).toBe(new Date('2026-10-29T15:00:00-03:00').toISOString())
    const semanal = backupSlots({ ...base, schedule: 'WEEKLY', weekday: 7 }, ahora, zona)
    expect(semanal.next?.toISOString()).toBe(new Date('2026-11-01T03:00:00-03:00').toISOString())
    expect(backupSlots({ ...base, paused: true }, ahora, zona)).toEqual({ latest: null, next: null })
  })

  it('el mensaje solo admite las variables conocidas', () => {
    expect(renderTemplate('Hola {nombre}, {otra}', { nombre: 'Ana', fecha: '', hora: '', profesional: '', sede: '', consultorio: '' })).toBe('Hola Ana, {otra}')
  })
})
