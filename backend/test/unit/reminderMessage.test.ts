import { describe, expect, it } from 'vitest'
import { reminderMessage, whatsappLink, whatsappNumber } from '../../src/modules/reminders/domain/message.js'

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
    const mensaje = reminderMessage({
      firstName: 'Ana',
      day: '28/10/2026',
      time: '10:30',
      professional: 'Dra. Paz',
      branch: 'Centro',
      clinic: 'Consultorio Sonrisas',
    })
    expect(mensaje).toContain('turno del 28/10/2026 a las 10:30 con Dra. Paz')
    expect(whatsappLink('11 5555-1234', mensaje)).toMatch(/^https:\/\/wa\.me\/5491155551234\?text=Hola%20Ana/)
  })
})
