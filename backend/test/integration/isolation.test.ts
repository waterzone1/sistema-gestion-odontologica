import type request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  as,
  buildApp,
  loginAs,
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

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  admin = await loginAs(app, 'admin')
})

describe('una instalacion, una organizacion', () => {
  it('la base impide crear una segunda organizacion', async () => {
    await expect(db.organization.create({ data: { name: 'Otra' } })).rejects.toThrow()
    expect(await db.organization.count()).toBe(1)
  })
})

describe('aislamiento por organizacion', () => {
  let ajenoId: string
  let sedeAjenaId: string

  beforeEach(async () => {
    await db.$executeRawUnsafe('DROP INDEX IF EXISTS "Organization_singleton"')
    const otra = await db.organization.create({ data: { name: 'Otra Organizacion' } })
    const sede = await db.branch.create({ data: { organizationId: otra.id, name: 'Sede Ajena' } })
    sedeAjenaId = sede.id
    const ajeno = await seedUser(
      db,
      { organizationId: otra.id, branchId: sede.id, secondBranchId: sede.id },
      { username: 'ajeno', roles: ['DENTIST'] },
    )
    ajenoId = ajeno.id
  })

  afterAll(async () => {
    await resetDb(db)
    await db.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "Organization_singleton" ON "Organization" ((true))')
  })

  it('no ve ni modifica usuarios de otra organizacion', async () => {
    const lista = await as(app, admin).get('/api/users')
    expect((lista.body as { username: string }[]).map((u) => u.username)).toEqual(['admin'])

    expect((await as(app, admin).get(`/api/users/${ajenoId}`)).status).toBe(404)
    expect((await as(app, admin).patch(`/api/users/${ajenoId}`, { displayName: 'Hackeado' })).status).toBe(404)
    expect((await as(app, admin).post(`/api/users/${ajenoId}/deactivate`)).status).toBe(404)
    expect((await as(app, admin).post(`/api/users/${ajenoId}/reset-password`, { password: 'clave-nueva-larga-1' })).status).toBe(404)
    expect((await as(app, admin).post(`/api/users/${ajenoId}/revoke-sessions`)).status).toBe(404)
    expect((await db.user.findUniqueOrThrow({ where: { id: ajenoId } })).active).toBe(true)
  })

  it('no ve ni modifica sedes de otra organizacion', async () => {
    const lista = await as(app, admin).get('/api/branches')
    expect((lista.body as { id: string }[]).map((b) => b.id)).not.toContain(sedeAjenaId)
    expect((await as(app, admin).patch(`/api/branches/${sedeAjenaId}`, { name: 'Hackeada' })).status).toBe(404)
  })

  it('no puede asignar una sede ajena a un usuario propio', async () => {
    const res = await as(app, admin).post('/api/users', {
      username: 'lucia',
      displayName: 'Lucía',
      password: 'clave-temporal-9081',
      roles: ['RECEPTIONIST'],
      branchIds: [sedeAjenaId],
    })
    expect(res.status).toBe(422)
    expect(codigo(res)).toBe('INVALID_BRANCH')
  })

  it('no ve ni modifica pacientes de otra organizacion', async () => {
    const ajeno = await db.patient.create({
      data: {
        organizationId: (await db.branch.findUniqueOrThrow({ where: { id: sedeAjenaId } })).organizationId,
        firstName: 'Ajena',
        lastName: 'Paciente',
        searchText: 'paciente ajena',
      },
    })
    const lista = await as(app, admin).get('/api/patients?q=ajena&status=all')
    expect((lista.body as { items: unknown[] }).items).toHaveLength(0)
    expect((await as(app, admin).get(`/api/patients/${ajeno.id}`)).status).toBe(404)
    expect((await as(app, admin).patch(`/api/patients/${ajeno.id}`, { firstName: 'Hackeada' })).status).toBe(404)
    expect((await as(app, admin).post(`/api/patients/${ajeno.id}/archive`)).status).toBe(404)
  })

  it('no le da perfil profesional a un usuario ajeno', async () => {
    const res = await as(app, admin).put(`/api/professionals/${ajenoId}`, { licenseNumber: 'MP-1' })
    expect(res.status).toBe(404)
  })
})
