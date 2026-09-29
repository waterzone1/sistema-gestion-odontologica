import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  as,
  buildApp,
  loginAs,
  ORIGIN,
  PASSWORD,
  resetDb,
  seedInstall,
  seedUser,
  testDb,
  type Client,
  type Seed,
} from '../helpers.js'

const db = testDb()
const app = buildApp(db)
let seed: Seed
let admin: Client

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  admin = await loginAs(app, 'admin')
})

const acciones = async () => (await db.auditLog.findMany()).map((e) => e.action)

describe('registro de auditoria', () => {
  it('registra login exitoso y fallido', async () => {
    await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ username: 'admin', password: 'mala-mala-1234' })
    await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ username: 'nadie', password: PASSWORD })
    const todas = await acciones()
    expect(todas).toContain('LOGIN_SUCCESS')
    expect(todas.filter((a) => a === 'LOGIN_FAILED')).toHaveLength(2)

    const fallo = await db.auditLog.findFirstOrThrow({ where: { action: 'LOGIN_FAILED' }, orderBy: { createdAt: 'asc' } })
    expect(fallo.metadata).toMatchObject({ username: 'admin', motivo: 'clave_incorrecta' })
  })

  it('registra logout, usuarios, roles, bajas y sedes con el actor', async () => {
    const creado = await as(app, admin).post('/api/users', {
      username: 'lucia',
      displayName: 'Lucía',
      password: 'clave-temporal-9081',
      roles: ['RECEPTIONIST'],
      branchIds: [seed.branchId],
    })
    const id = (creado.body as { id: string }).id
    await as(app, admin).patch(`/api/users/${id}`, { roles: ['RECEPTIONIST', 'DENTIST'] })
    await as(app, admin).post(`/api/users/${id}/reset-password`, { password: 'otra-temporal-2026' })
    await as(app, admin).post(`/api/users/${id}/deactivate`)
    await as(app, admin).post('/api/branches', { name: 'Sede Sur' })
    await as(app, admin).post('/api/auth/logout')

    const todas = await acciones()
    for (const esperada of [
      'USER_CREATED',
      'USER_UPDATED',
      'USER_ROLES_CHANGED',
      'USER_PASSWORD_RESET',
      'USER_DEACTIVATED',
      'BRANCH_CREATED',
      'LOGOUT',
    ]) {
      expect(todas).toContain(esperada)
    }
    const alta = await db.auditLog.findFirstOrThrow({ where: { action: 'USER_CREATED' } })
    expect(alta.actorUserId).toBe(admin.userId)
    expect(alta.entityId).toBe(id)
  })

  it('nunca guarda contraseñas, hashes ni tokens', async () => {
    await as(app, admin).post('/api/users', {
      username: 'lucia',
      displayName: 'Lucía',
      password: 'clave-temporal-9081',
      roles: ['RECEPTIONIST'],
      branchIds: [seed.branchId],
    })
    await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ username: 'admin', password: 'intento-secreto-77' })
    const todo = JSON.stringify(await db.auditLog.findMany())
    for (const secreto of ['clave-temporal-9081', 'intento-secreto-77', PASSWORD, 'argon2', admin.csrfToken]) {
      expect(todo).not.toContain(secreto)
    }
  })

  it('la base rechaza modificar o borrar registros de auditoria', async () => {
    expect((await db.auditLog.count())).toBeGreaterThan(0)
    await expect(db.$executeRawUnsafe(`UPDATE "AuditLog" SET "action" = 'ADULTERADO'`)).rejects.toThrow(/append-only/)
    await expect(db.$executeRawUnsafe(`DELETE FROM "AuditLog"`)).rejects.toThrow(/append-only/)
    expect(await db.auditLog.count({ where: { action: 'ADULTERADO' } })).toBe(0)
  })
})
