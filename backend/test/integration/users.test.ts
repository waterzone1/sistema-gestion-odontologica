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

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const nuevoUsuario = (over: Record<string, unknown> = {}) => ({
  username: 'Lucia',
  displayName: 'Lucía Fernández',
  password: 'clave-temporal-9081',
  roles: ['RECEPTIONIST'],
  branchIds: [seed.branchId],
  ...over,
})

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  admin = await loginAs(app, 'admin')
})

describe('alta de usuarios', () => {
  it('crea el usuario con clave temporal y sin exponer datos sensibles', async () => {
    const res = await as(app, admin).post('/api/users', nuevoUsuario())
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      username: 'lucia',
      active: true,
      mustChangePassword: true,
      roles: ['RECEPTIONIST'],
      branchIds: [seed.branchId],
    })
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|temporal-de-lucia/)
  })

  it('la clave temporal permite entrar pero obliga a cambiarla', async () => {
    await as(app, admin).post('/api/users', nuevoUsuario())
    const lucia = await loginAs(app, 'lucia', 'clave-temporal-9081')
    const res = await as(app, lucia).get('/api/branches')
    expect(res.status).toBe(403)
    expect(codigo(res)).toBe('PASSWORD_CHANGE_REQUIRED')
  })

  it('rechaza un nombre de usuario repetido sin distinguir mayusculas', async () => {
    await as(app, admin).post('/api/users', nuevoUsuario()).expect(201)
    const res = await as(app, admin).post('/api/users', nuevoUsuario({ username: 'LUCIA' }))
    expect(res.status).toBe(409)
    expect(codigo(res)).toBe('USERNAME_TAKEN')
  })

  it('rechaza una contraseña debil', async () => {
    const res = await as(app, admin).post('/api/users', nuevoUsuario({ password: 'corta' }))
    expect(res.status).toBe(422)
    expect(codigo(res)).toBe('WEAK_PASSWORD')
  })

  it('odontologo y recepcion necesitan sede; un admin puro no', async () => {
    const sinSede = await as(app, admin).post('/api/users', nuevoUsuario({ branchIds: [] }))
    expect(sinSede.status).toBe(422)
    expect(codigo(sinSede)).toBe('BRANCH_REQUIRED')

    const adminPuro = await as(app, admin).post(
      '/api/users',
      nuevoUsuario({ username: 'otro-admin', roles: ['ADMIN'], branchIds: [] }),
    )
    expect(adminPuro.status).toBe(201)
  })

  it('rechaza sedes inexistentes o inactivas', async () => {
    const inexistente = await as(app, admin).post(
      '/api/users',
      nuevoUsuario({ branchIds: ['00000000-0000-7000-8000-000000000000'] }),
    )
    expect(codigo(inexistente)).toBe('INVALID_BRANCH')

    await db.branch.update({ where: { id: seed.secondBranchId }, data: { active: false } })
    const inactiva = await as(app, admin).post('/api/users', nuevoUsuario({ branchIds: [seed.secondBranchId] }))
    expect(codigo(inactiva)).toBe('INVALID_BRANCH')
  })

  it('valida el formato de los datos', async () => {
    const res = await as(app, admin).post('/api/users', nuevoUsuario({ username: 'con espacios!', roles: [] }))
    expect(res.status).toBe(400)
  })

  it('lista los usuarios sin datos sensibles', async () => {
    await as(app, admin).post('/api/users', nuevoUsuario())
    const res = await as(app, admin).get('/api/users')
    expect(res.status).toBe(200)
    expect((res.body as unknown[]).length).toBe(2)
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/)
  })

  it('devuelve 404 para un usuario inexistente y 400 para un id mal formado', async () => {
    expect((await as(app, admin).get('/api/users/00000000-0000-7000-8000-000000000000')).status).toBe(404)
    expect((await as(app, admin).get('/api/users/no-es-uuid')).status).toBe(400)
  })
})

describe('edicion de usuarios y roles', () => {
  it('un cambio de roles se aplica de inmediato sobre la sesion abierta', async () => {
    await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
    const recepcion = await loginAs(app, 'recepcion')
    expect((await as(app, recepcion).get('/api/users')).status).toBe(403)

    await as(app, admin).patch(`/api/users/${recepcion.userId}`, { roles: ['RECEPTIONIST', 'ADMIN'] }).expect(200)
    expect((await as(app, recepcion).get('/api/users')).status).toBe(200)

    await as(app, admin).patch(`/api/users/${recepcion.userId}`, { roles: ['RECEPTIONIST'] }).expect(200)
    expect((await as(app, recepcion).get('/api/users')).status).toBe(403)
  })

  it('actualiza nombre y sedes y registra el cambio de roles en la auditoria', async () => {
    const creado = await as(app, admin).post('/api/users', nuevoUsuario())
    const id = (creado.body as { id: string }).id
    const res = await as(app, admin).patch(`/api/users/${id}`, {
      displayName: 'Lucía F.',
      roles: ['RECEPTIONIST', 'DENTIST'],
      branchIds: [seed.branchId, seed.secondBranchId],
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ displayName: 'Lucía F.' })
    expect((res.body as { roles: string[] }).roles).toContain('DENTIST')
    expect((res.body as { branchIds: string[] }).branchIds).toHaveLength(2)

    const evento = await db.auditLog.findFirstOrThrow({ where: { action: 'USER_ROLES_CHANGED', entityId: id } })
    expect(evento.metadata).toMatchObject({ antes: ['RECEPTIONIST'] })
  })

  it('no permite dejar al sistema sin administradores', async () => {
    const res = await as(app, admin).patch(`/api/users/${admin.userId}`, { roles: ['RECEPTIONIST'] })
    expect(res.status).toBe(409)
    expect(codigo(res)).toBe('LAST_ADMIN')
  })

  it('si hay otro administrador si se puede quitar el rol', async () => {
    await seedUser(db, seed, { username: 'admin2', roles: ['ADMIN'] })
    const res = await as(app, admin).patch(`/api/users/${admin.userId}`, {
      roles: ['RECEPTIONIST'],
      branchIds: [seed.branchId],
    })
    expect(res.status).toBe(200)
  })

  it('rechaza una edicion vacia', async () => {
    expect((await as(app, admin).patch(`/api/users/${admin.userId}`, {})).status).toBe(400)
  })
})

describe('contraseña, baja y sesiones', () => {
  it('resetear la clave revoca las sesiones y obliga a cambiarla', async () => {
    const creado = await as(app, admin).post('/api/users', nuevoUsuario())
    const id = (creado.body as { id: string }).id
    const lucia = await loginAs(app, 'lucia', 'clave-temporal-9081')

    const res = await as(app, admin).post(`/api/users/${id}/reset-password`, { password: 'otra-temporal-2026' })
    expect(res.status).toBe(204)
    expect((await as(app, lucia).get('/api/auth/me')).status).toBe(401)

    const login = (password: string) =>
      request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ username: 'lucia', password })
    expect((await login('clave-temporal-9081')).status).toBe(401)
    expect((await login('otra-temporal-2026')).status).toBe(200)
  })

  it('desactivar revoca las sesiones al instante y bloquea el login', async () => {
    await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
    const recepcion = await loginAs(app, 'recepcion')
    expect((await as(app, recepcion).get('/api/auth/me')).status).toBe(200)

    const res = await as(app, admin).post(`/api/users/${recepcion.userId}/deactivate`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ active: false })

    expect((await as(app, recepcion).get('/api/auth/me')).status).toBe(401)
    const login = await request(app)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'recepcion', password: PASSWORD })
    expect(login.status).toBe(401)
  })

  it('desactivar es idempotente y se puede reactivar', async () => {
    const otro = await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
    await as(app, admin).post(`/api/users/${otro.id}/deactivate`).expect(200)
    await as(app, admin).post(`/api/users/${otro.id}/deactivate`).expect(200)
    expect(await db.auditLog.count({ where: { action: 'USER_DEACTIVATED' } })).toBe(1)

    await as(app, admin).post(`/api/users/${otro.id}/activate`).expect(200)
    expect((await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ username: 'recepcion', password: PASSWORD })).status).toBe(200)
  })

  it('no permite desactivarse a si mismo', async () => {
    const res = await as(app, admin).post(`/api/users/${admin.userId}/deactivate`)
    expect(res.status).toBe(409)
    expect(codigo(res)).toBe('CANNOT_DEACTIVATE_SELF')
  })

  it('revocar sesiones cierra todas las del usuario', async () => {
    await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
    const a = await loginAs(app, 'recepcion')
    const b = await loginAs(app, 'recepcion')
    const res = await as(app, admin).post(`/api/users/${a.userId}/revoke-sessions`)
    expect(res.body).toEqual({ revokedSessions: 2 })
    expect((await as(app, a).get('/api/auth/me')).status).toBe(401)
    expect((await as(app, b).get('/api/auth/me')).status).toBe(401)
    expect((await as(app, admin).get('/api/auth/me')).status).toBe(200)
  })

  it('no existe ningun endpoint para borrar usuarios', async () => {
    const otro = await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
    const res = await as(app, admin).get(`/api/users/${otro.id}`)
    expect(res.status).toBe(200)
    const del = await request(app)
      .delete(`/api/users/${otro.id}`)
      .set('Cookie', admin.cookie)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', admin.csrfToken)
    expect(del.status).toBe(404)
    expect(await db.user.count()).toBe(2)
  })
})
