import type request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
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
let dentistId: string
let recepcionId: string

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  dentistId = (await seedUser(db, seed, { username: 'dra.ruiz', displayName: 'Dra. Ruiz', roles: ['DENTIST'] })).id
  recepcionId = (await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })).id
  admin = await loginAs(app, 'admin')
})

describe('perfil profesional', () => {
  it('solo un usuario con rol odontologo puede tener perfil', async () => {
    const res = await as(app, admin).put(`/api/professionals/${recepcionId}`, { licenseNumber: 'MP-1' })
    expect(res.status).toBe(422)
    expect(codigo(res)).toBe('NOT_A_DENTIST')
  })

  it('crea y luego actualiza el perfil del odontologo', async () => {
    const creado = await as(app, admin).put(`/api/professionals/${dentistId}`, {
      licenseNumber: 'MP-1234',
    })
    expect(creado.status).toBe(200)
    expect(creado.body).toMatchObject({
      userId: dentistId,
      displayName: 'Dra. Ruiz',
      licenseNumber: 'MP-1234',
      active: true,
      branchIds: [seed.branchId],
    })

    const editado = await as(app, admin).put(`/api/professionals/${dentistId}`, { licenseNumber: 'MP-9999' })
    expect(editado.body).toMatchObject({ licenseNumber: 'MP-9999' })
    expect(await db.professionalProfile.count()).toBe(1)
  })

  it('exige la matricula', async () => {
    expect((await as(app, admin).put(`/api/professionals/${dentistId}`, { licenseNumber: '' })).status).toBe(400)
  })

  it('cualquier rol autenticado puede listar profesionales', async () => {
    await as(app, admin).put(`/api/professionals/${dentistId}`, { licenseNumber: 'MP-1234' })
    const recepcion = await loginAs(app, 'recepcion')
    const res = await as(app, recepcion).get('/api/professionals')
    expect(res.status).toBe(200)
    expect((res.body as unknown[]).length).toBe(1)
  })

  it('quitarle el rol odontologo desactiva su perfil', async () => {
    await as(app, admin).put(`/api/professionals/${dentistId}`, { licenseNumber: 'MP-1234' })
    await as(app, admin)
      .patch(`/api/users/${dentistId}`, { roles: ['RECEPTIONIST'] })
      .expect(200)
    const perfil = await db.professionalProfile.findUniqueOrThrow({ where: { userId: dentistId } })
    expect(perfil.active).toBe(false)
  })

  it('el usuario aparece con su perfil en el listado de usuarios', async () => {
    await as(app, admin).put(`/api/professionals/${dentistId}`, { licenseNumber: 'MP-1234' })
    const res = await as(app, admin).get(`/api/users/${dentistId}`)
    expect(res.body).toMatchObject({ professional: { licenseNumber: 'MP-1234', active: true } })
  })
})
