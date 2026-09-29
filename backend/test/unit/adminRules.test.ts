import { describe, expect, it } from 'vitest'
import { isLastActiveAdmin, requiresBranch } from '../../src/modules/users/domain/adminRules.js'

describe('isLastActiveAdmin', () => {
  it('es el ultimo si es el unico admin activo', () => {
    expect(isLastActiveAdmin(['a'], 'a')).toBe(true)
  })

  it('no es el ultimo si hay otro admin activo', () => {
    expect(isLastActiveAdmin(['a', 'b'], 'a')).toBe(false)
  })

  it('no aplica si el usuario no esta entre los admins activos', () => {
    expect(isLastActiveAdmin(['a'], 'b')).toBe(false)
    expect(isLastActiveAdmin([], 'a')).toBe(false)
  })
})

describe('requiresBranch', () => {
  it('un admin puro no necesita sede', () => {
    expect(requiresBranch(['ADMIN'])).toBe(false)
  })

  it('odontologo y recepcion si necesitan sede', () => {
    expect(requiresBranch(['DENTIST'])).toBe(true)
    expect(requiresBranch(['RECEPTIONIST'])).toBe(true)
    expect(requiresBranch(['ADMIN', 'DENTIST'])).toBe(true)
  })
})
