import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../../src/shared/password.js'
import { generateToken, hashToken, safeEqual } from '../../src/shared/tokens.js'

describe('contraseñas', () => {
  it('usa argon2id y nunca guarda la clave en claro', async () => {
    const hash = await hashPassword('una-clave-larga-1')
    expect(hash.startsWith('$argon2id$')).toBe(true)
    expect(hash).not.toContain('una-clave-larga-1')
  })

  it('verifica la clave correcta y rechaza la incorrecta', async () => {
    const hash = await hashPassword('una-clave-larga-1')
    expect(await verifyPassword(hash, 'una-clave-larga-1')).toBe(true)
    expect(await verifyPassword(hash, 'otra-clave-larga-1')).toBe(false)
  })

  it('un hash mal formado no verifica ni rompe', async () => {
    expect(await verifyPassword('no-es-un-hash', 'lo-que-sea')).toBe(false)
  })

  it('dos hashes de la misma clave son distintos (sal)', async () => {
    const [a, b] = await Promise.all([hashPassword('misma-clave-1'), hashPassword('misma-clave-1')])
    expect(a).not.toBe(b)
  })
})

describe('tokens', () => {
  it('genera tokens distintos y largos', () => {
    const a = generateToken()
    expect(a).not.toBe(generateToken())
    expect(a.length).toBeGreaterThanOrEqual(43)
  })

  it('el hash es determinista y no revela el token', () => {
    const t = generateToken()
    expect(hashToken(t)).toBe(hashToken(t))
    expect(hashToken(t)).not.toContain(t)
    expect(hashToken(t)).toHaveLength(64)
  })

  it('safeEqual compara igualdad y longitud', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})
