import { describe, expect, it } from 'vitest'
import {
  absoluteExpiry,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  sessionState,
  shouldTouch,
} from '../../src/modules/auth/domain/session.js'

const ahora = new Date('2026-09-29T12:00:00Z')
const haceMs = (ms: number) => new Date(ahora.getTime() - ms)

function sesion(parcial: Partial<{ lastSeenAt: Date; expiresAt: Date; revokedAt: Date | null }> = {}) {
  return {
    lastSeenAt: ahora,
    expiresAt: absoluteExpiry(ahora),
    revokedAt: null,
    ...parcial,
  }
}

describe('sessionState', () => {
  it('una sesion recien creada es valida', () => {
    expect(sessionState(sesion(), ahora)).toBe('valid')
  })

  it('una sesion revocada no es valida aunque no haya vencido', () => {
    expect(sessionState(sesion({ revokedAt: haceMs(1000) }), ahora)).toBe('revoked')
  })

  it('vence por tiempo absoluto', () => {
    expect(sessionState(sesion({ expiresAt: haceMs(1) }), ahora)).toBe('expired')
  })

  it('vence por inactividad', () => {
    expect(sessionState(sesion({ lastSeenAt: haceMs(SESSION_IDLE_MS) }), ahora)).toBe('idle')
  })

  it('justo antes del limite de inactividad sigue valida', () => {
    expect(sessionState(sesion({ lastSeenAt: haceMs(SESSION_IDLE_MS - 1) }), ahora)).toBe('valid')
  })

  it('el vencimiento absoluto es de 7 dias', () => {
    expect(absoluteExpiry(ahora).getTime() - ahora.getTime()).toBe(SESSION_ABSOLUTE_MS)
    expect(SESSION_ABSOLUTE_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })
})

describe('shouldTouch', () => {
  it('no actualiza si se vio hace poco', () => {
    expect(shouldTouch(haceMs(10_000), ahora)).toBe(false)
  })

  it('actualiza pasado el intervalo', () => {
    expect(shouldTouch(haceMs(61_000), ahora)).toBe(true)
  })
})
