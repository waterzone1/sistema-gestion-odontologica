import type request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  as,
  buildApp,
  loginAs,
  resetDb,
  seedInstall,
  seedPractice,
  seedUser,
  testDb,
  type Client,
  type Seed,
} from '../helpers.js'

const db = testDb()
const app = buildApp(db)
let seed: Seed
let admin: Client
let recepcion: Client
let odontologo: Client

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const nuevaPractica = (extra: Record<string, unknown> = {}) => ({
  code: 'rx-01',
  name: 'Radiografía periapical',
  basePrice: '8500',
  defaultDurationMinutes: 15,
  ...extra,
})

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  await seedUser(db, seed, { username: 'odontologo', roles: ['DENTIST'] })
  admin = await loginAs(app, 'admin')
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
})

describe('catalogo de practicas', () => {
  it('el admin crea una practica: codigo en mayusculas e importe con dos decimales', async () => {
    const res = await as(app, admin).post('/api/practices', nuevaPractica())
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      code: 'RX-01',
      name: 'Radiografía periapical',
      basePrice: '8500.00',
      defaultDurationMinutes: 15,
      active: true,
    })
  })

  it('administracion y recepcion crean o editan; el odontologo solo consulta', async () => {
    const creada = await seedPractice(db, seed)
    expect((await as(app, odontologo).post('/api/practices', nuevaPractica())).status).toBe(403)
    expect((await as(app, odontologo).patch(`/api/practices/${creada.id}`, { name: 'Otro' })).status).toBe(403)
    expect((await as(app, odontologo).get('/api/practices')).status).toBe(200)
    expect((await as(app, recepcion).post('/api/practices', nuevaPractica())).status).toBe(201)
    expect((await as(app, recepcion).patch(`/api/practices/${creada.id}`, { basePrice: '12000' })).status).toBe(200)
    expect(await db.practice.count()).toBe(2)
  })

  it('rechaza codigos repetidos', async () => {
    await as(app, admin).post('/api/practices', nuevaPractica()).expect(201)
    const res = await as(app, admin).post('/api/practices', nuevaPractica({ code: 'RX-01', name: 'Otra' }))
    expect(res.status).toBe(409)
    expect(codigo(res)).toBe('DUPLICATE_PRACTICE')
  })

  it('valida codigo, importe y duracion', async () => {
    for (const malo of [
      { code: 'a' },
      { code: 'con espacio' },
      { basePrice: '0' },
      { basePrice: '-5' },
      { basePrice: '10.999' },
      { basePrice: 'diez' },
      { defaultDurationMinutes: 3 },
      { defaultDurationMinutes: 600 },
      { name: '' },
    ]) {
      expect((await as(app, admin).post('/api/practices', nuevaPractica(malo))).status).toBe(400)
    }
  })

  it('usa 30 minutos si no se indica la duracion', async () => {
    const res = await as(app, admin).post('/api/practices', {
      code: 'CON-1',
      name: 'Consulta',
      basePrice: '5000',
    })
    expect((res.body as { defaultDurationMinutes: number }).defaultDurationMinutes).toBe(30)
  })

  it('lista todas o solo las activas', async () => {
    await seedPractice(db, seed, { name: 'Activa' })
    await seedPractice(db, seed, { name: 'Inactiva', active: false })
    const todas = await as(app, recepcion).get('/api/practices')
    const activas = await as(app, recepcion).get('/api/practices?status=active')
    expect((todas.body as unknown[]).length).toBe(2)
    expect((activas.body as { name: string }[]).map((p) => p.name)).toEqual(['Activa'])
  })

  it('edita, desactiva y audita el cambio de precio', async () => {
    const creada = await seedPractice(db, seed, { basePrice: '10000.00' })
    const res = await as(app, admin).patch(`/api/practices/${creada.id}`, { basePrice: '12000.50', active: false })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ basePrice: '12000.50', active: false })
    const evento = await db.auditLog.findFirstOrThrow({ where: { action: 'PRACTICE_UPDATED' } })
    expect(evento.metadata).toMatchObject({ precioAntes: '10000.00', precioDespues: '12000.50' })
  })

  it('devuelve 404 para una practica inexistente y no hay forma de borrar', async () => {
    expect(
      (await as(app, admin).patch('/api/practices/00000000-0000-7000-8000-000000000000', { name: 'Fantasma' })).status,
    ).toBe(404)
  })
})
