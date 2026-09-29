import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSetupTokenStore } from '../../src/modules/organizations/setupToken.js'
import { buildApp, ORIGIN, PASSWORD, resetDb, SETUP_TOKEN, testDb } from '../helpers.js'

const db = testDb()

function payload(overrides: Record<string, unknown> = {}) {
  return {
    setupToken: SETUP_TOKEN,
    organization: { name: 'Odontología Del Plata' },
    branch: { name: 'Sede Central', address: 'Av. Siempre Viva 742' },
    admin: { username: 'Marta', displayName: 'Marta Gómez', password: PASSWORD },
    ...overrides,
  }
}

beforeEach(async () => {
  await resetDb(db)
})

describe('setup inicial', () => {
  it('informa que falta configurar cuando no hay organizacion', async () => {
    const res = await request(buildApp(db)).get('/api/setup/status')
    expect(res.body).toEqual({ needsSetup: true })
  })

  it('rechaza un token incorrecto', async () => {
    const res = await request(buildApp(db))
      .post('/api/setup')
      .set('Origin', ORIGIN)
      .send(payload({ setupToken: 'otro-token' }))
    expect(res.status).toBe(403)
    expect(await db.organization.count()).toBe(0)
  })

  it('rechaza el setup si no hay token emitido', async () => {
    const app = buildApp(db, { setupTokens: createSetupTokenStore(null) })
    const res = await request(app).post('/api/setup').set('Origin', ORIGIN).send(payload())
    expect(res.status).toBe(403)
  })

  it('rechaza una contraseña debil', async () => {
    const res = await request(buildApp(db))
      .post('/api/setup')
      .set('Origin', ORIGIN)
      .send(payload({ admin: { username: 'marta', displayName: 'Marta', password: 'corta' } }))
    expect(res.status).toBe(422)
    expect((res.body as { error: { code: string } }).error.code).toBe('WEAK_PASSWORD')
    expect(await db.organization.count()).toBe(0)
  })

  it('crea organizacion, sede, admin y sesion en una sola operacion', async () => {
    const res = await request(buildApp(db)).post('/api/setup').set('Origin', ORIGIN).send(payload())
    expect(res.status).toBe(201)
    const body = res.body as { user: { username: string; roles: string[]; permissions: string[] } }
    expect(body.user.username).toBe('marta')
    expect(body.user.roles).toEqual(['ADMIN'])
    expect(body.user.permissions).toContain('users:manage')

    const cookies = res.headers['set-cookie'] as unknown as string[]
    expect(cookies[0]).toMatch(/^sid=/)
    expect(cookies[0]).toMatch(/HttpOnly/i)
    expect(cookies[0]).toMatch(/SameSite=Lax/i)

    expect(await db.organization.count()).toBe(1)
    expect(await db.branch.count()).toBe(1)
    const admin = await db.user.findFirstOrThrow({ include: { roles: true, branches: true } })
    expect(admin.roles.map((r) => r.role)).toEqual(['ADMIN'])
    expect(admin.branches).toHaveLength(1)
    expect(admin.passwordHash.startsWith('$argon2id$')).toBe(true)
    expect(await db.auditLog.count({ where: { action: 'SETUP_COMPLETED' } })).toBe(1)
  })

  it('la sesion devuelta por el setup ya sirve', async () => {
    const app = buildApp(db)
    const res = await request(app).post('/api/setup').set('Origin', ORIGIN).send(payload())
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0] ?? ''
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(me.status).toBe(200)
  })

  it('una vez configurado responde 409 y ya no hace falta setup', async () => {
    const app = buildApp(db)
    await request(app).post('/api/setup').set('Origin', ORIGIN).send(payload()).expect(201)

    const otra = await request(app)
      .post('/api/setup')
      .set('Origin', ORIGIN)
      .send(payload({ admin: { username: 'intruso', displayName: 'Intruso', password: PASSWORD } }))
    expect(otra.status).toBe(409)
    expect(await db.user.count()).toBe(1)

    const estado = await request(app).get('/api/setup/status')
    expect(estado.body).toEqual({ needsSetup: false })
  })

  it('con dos setups simultaneos solo uno prospera', async () => {
    const app = buildApp(db)
    const enviar = () => request(app).post('/api/setup').set('Origin', ORIGIN).send(payload())
    const [a, b] = await Promise.all([enviar(), enviar()])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    expect(await db.organization.count()).toBe(1)
  })
})
