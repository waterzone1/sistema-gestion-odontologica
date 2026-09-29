import { describe, expect, it } from 'vitest'
import { loadEnv } from '../../src/config/env.js'

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' }

describe('loadEnv', () => {
  it('aplica defaults cuando solo esta la base', () => {
    const env = loadEnv(base)
    expect(env.PORT).toBe(4000)
    expect(env.NODE_ENV).toBe('development')
    expect(env.LOG_LEVEL).toBe('info')
  })

  it('convierte PORT a numero', () => {
    expect(loadEnv({ ...base, PORT: '8080' }).PORT).toBe(8080)
  })

  it('falla y nombra la variable cuando falta DATABASE_URL', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/)
  })

  it('rechaza una url que no es de postgres', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/postgresql:\/\//)
  })

  it('rechaza un puerto fuera de rango', () => {
    expect(() => loadEnv({ ...base, PORT: '70000' })).toThrow(/PORT/)
  })
})
