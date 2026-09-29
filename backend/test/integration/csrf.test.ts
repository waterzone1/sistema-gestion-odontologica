import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { as, buildApp, loginAs, ORIGIN, PASSWORD, resetDb, seedInstall, seedUser, testDb } from '../helpers.js'

const db = testDb()

beforeEach(async () => {
  await resetDb(db)
  const seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
})

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code

describe('proteccion CSRF', () => {
  it('rechaza una escritura sin Origin', async () => {
    const res = await request(buildApp(db)).post('/api/auth/login').send({ username: 'admin', password: PASSWORD })
    expect(res.status).toBe(403)
    expect(codigo(res)).toBe('CSRF_ORIGIN')
  })

  it('rechaza una escritura con un Origin ajeno', async () => {
    const res = await request(buildApp(db))
      .post('/api/auth/login')
      .set('Origin', 'https://sitio-malicioso.example')
      .send({ username: 'admin', password: PASSWORD })
    expect(res.status).toBe(403)
    expect(codigo(res)).toBe('CSRF_ORIGIN')
  })

  it('con sesion y Origin valido, exige ademas el token', async () => {
    const app = buildApp(db)
    const client = await loginAs(app, 'admin')
    const sinToken = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', client.cookie)
      .set('Origin', ORIGIN)
    expect(sinToken.status).toBe(403)
    expect(codigo(sinToken)).toBe('CSRF_TOKEN')

    const tokenMalo = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', client.cookie)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', 'token-equivocado')
    expect(tokenMalo.status).toBe(403)
    expect(codigo(tokenMalo)).toBe('CSRF_TOKEN')
  })

  it('el token de una sesion no sirve en otra', async () => {
    const app = buildApp(db)
    const a = await loginAs(app, 'admin')
    const b = await loginAs(app, 'admin')
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', a.cookie)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', b.csrfToken)
    expect(res.status).toBe(403)
  })

  it('con Origin y token correctos la escritura pasa', async () => {
    const app = buildApp(db)
    const client = await loginAs(app, 'admin')
    expect((await as(app, client).post('/api/auth/logout')).status).toBe(204)
  })

  it('las lecturas no requieren Origin ni token', async () => {
    const app = buildApp(db)
    const client = await loginAs(app, 'admin')
    const res = await request(app).get('/api/auth/me').set('Cookie', client.cookie)
    expect(res.status).toBe(200)
  })
})
