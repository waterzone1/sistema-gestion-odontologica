import { describe, expect, it } from 'vitest'
import { checkPassword } from '../../src/modules/auth/domain/passwordPolicy.js'

describe('checkPassword', () => {
  it('acepta una clave larga y no trivial', () => {
    expect(checkPassword('caballo-bateria-grapa-7', 'lucia')).toEqual([])
  })

  it('rechaza claves cortas', () => {
    expect(checkPassword('corta1', 'lucia')).toContainEqual(expect.stringContaining('al menos 10'))
  })

  it('rechaza claves demasiado largas', () => {
    expect(checkPassword('a1'.repeat(80), 'lucia')).toContainEqual(expect.stringContaining('superar'))
  })

  it('rechaza claves comunes sin distinguir mayusculas', () => {
    expect(checkPassword('Password123', 'lucia')).toContainEqual(expect.stringContaining('común'))
  })

  it('rechaza claves que contienen el usuario', () => {
    expect(checkPassword('lucia-2026-clave', 'lucia')).toContainEqual(
      expect.stringContaining('usuario'),
    )
  })

  it('rechaza un solo caracter repetido', () => {
    expect(checkPassword('aaaaaaaaaaaa', 'lucia')).toContainEqual(expect.stringContaining('repetir'))
  })

  it('no exige reglas de composicion', () => {
    expect(checkPassword('solo minusculas y espacios', 'lucia')).toEqual([])
  })
})
