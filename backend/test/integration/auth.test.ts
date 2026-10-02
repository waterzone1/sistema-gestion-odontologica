import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { as, buildApp, capturingLogger, loginAs, ORIGIN, PASSWORD, resetDb, seedInstall, seedUser, testDb, type Seed } from '../helpers.js'

const db = testDb()
let seed: Seed

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
})

function login(app: ReturnType<typeof buildApp>, username: string, password: string) {
  return request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ username, password })
}

describe('login', () => {
  it('inicia sesion con cookie HttpOnly y devuelve el usuario sin datos sensibles', async () => {
    const res = await login(buildApp(db), 'Admin', PASSWORD)
    expect(res.status).toBe(200)
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0] ?? ''
    expect(cookie).toMatch(/^sid=/)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/)
    const body = res.body as { user: { roles: string[]; permissions: string[] }; csrfToken: string }
    expect(body.user.roles).toEqual(['ADMIN'])
    expect(body.csrfToken.length).toBeGreaterThan(20)
  })

  it('en produccion la cookie es Secure', async () => {
    const res = await login(buildApp(db, { cookieSecure: true }), 'admin', PASSWORD)
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/Secure/i)
  })

  it('guarda el hash del token, no el token', async () => {
    const res = await login(buildApp(db), 'admin', PASSWORD)
    const token = ((res.headers['set-cookie'] as unknown as string[])[0] ?? '').split(';')[0]?.slice(4) ?? ''
    const sesiones = await db.session.findMany()
    expect(sesiones).toHaveLength(1)
    expect(sesiones[0]?.tokenHash).not.toBe(token)
    expect(JSON.stringify(sesiones)).not.toContain(token)
  })

  it('usuario inexistente y clave incorrecta dan exactamente la misma respuesta', async () => {
    const app = buildApp(db)
    const inexistente = await login(app, 'nadie', PASSWORD)
    const incorrecta = await login(app, 'admin', 'clave-equivocada-1')
    expect(inexistente.status).toBe(401)
    expect(incorrecta.status).toBe(401)
    expect(inexistente.body).toEqual(incorrecta.body)
  })

  it('un usuario inactivo no puede iniciar sesion', async () => {
    await seedUser(db, seed, { username: 'baja', roles: ['RECEPTIONIST'], active: false })
    const res = await login(buildApp(db), 'baja', PASSWORD)
    expect(res.status).toBe(401)
  })

  it('frena la fuerza bruta con 429 despues de los intentos fallidos', async () => {
    const app = buildApp(db, { loginRateLimit: { max: 3, windowMs: 60_000 } })
    for (let i = 0; i < 3; i++) {
      expect((await login(app, 'admin', 'mal-mal-mal-1')).status).toBe(401)
    }
    const bloqueado = await login(app, 'admin', 'mal-mal-mal-1')
    expect(bloqueado.status).toBe(429)
    expect((await login(app, 'recepcion', PASSWORD)).status).toBe(200)
  })

  it('los logins exitosos no cuentan para el limite', async () => {
    const app = buildApp(db, { loginRateLimit: { max: 2, windowMs: 60_000 } })
    for (let i = 0; i < 5; i++) expect((await login(app, 'admin', PASSWORD)).status).toBe(200)
  })

  it('ni la contraseña ni el token aparecen en los logs', async () => {
    const { logger, lines } = capturingLogger()
    const app = buildApp(db, { logger })
    const ok = await login(app, 'admin', PASSWORD)
    await login(app, 'admin', 'intento-fallido-secreto-9')
    const token = ((ok.headers['set-cookie'] as unknown as string[])[0] ?? '').split(';')[0]?.slice(4) ?? ''
    const todo = lines.join('\n')
    expect(lines.length).toBeGreaterThan(0)
    expect(todo).not.toContain(PASSWORD)
    expect(todo).not.toContain('intento-fallido-secreto-9')
    expect(todo).not.toContain(token)
    expect(todo).not.toContain('argon2')
  })
})

describe('sesion', () => {
  it('me devuelve el usuario de la sesion y exige estar autenticado', async () => {
    const app = buildApp(db)
    expect((await request(app).get('/api/auth/me')).status).toBe(401)
    const client = await loginAs(app, 'admin')
    const me = await as(app, client).get('/api/auth/me')
    expect(me.status).toBe(200)
    expect((me.body as { user: { username: string } }).user.username).toBe('admin')
  })

  it('logout invalida la sesion', async () => {
    const app = buildApp(db)
    const client = await loginAs(app, 'admin')
    expect((await as(app, client).post('/api/auth/logout')).status).toBe(204)
    expect((await as(app, client).get('/api/auth/me')).status).toBe(401)
    expect(await db.session.count({ where: { revokedAt: null } })).toBe(0)
  })

  it('vence por tiempo absoluto', async () => {
    const app = buildApp(db)
    const client = await loginAs(app, 'admin')
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await as(app, client).get('/api/auth/me')).status).toBe(401)
  })

  it('vence por inactividad', async () => {
    const app = buildApp(db)
    const client = await loginAs(app, 'admin')
    await db.session.updateMany({ data: { lastSeenAt: new Date(Date.now() - 9 * 60 * 60 * 1000) } })
    expect((await as(app, client).get('/api/auth/me')).status).toBe(401)
  })

  it('una cookie con un token inventado no autentica', async () => {
    const res = await request(buildApp(db)).get('/api/auth/me').set('Cookie', 'sid=inventado')
    expect(res.status).toBe(401)
  })

  it('cada login crea una sesion nueva', async () => {
    const app = buildApp(db)
    const a = await loginAs(app, 'admin')
    const b = await loginAs(app, 'admin')
    expect(a.cookie).not.toBe(b.cookie)
    expect(a.csrfToken).not.toBe(b.csrfToken)
  })
})

describe('cambio de contraseña', () => {
  it('un usuario con clave temporal solo puede ver su sesion, cambiarla o salir', async () => {
    await seedUser(db, seed, { username: 'nuevo', roles: ['ADMIN'], mustChangePassword: true })
    const app = buildApp(db)
    const client = await loginAs(app, 'nuevo')
    expect((await as(app, client).get('/api/auth/me')).status).toBe(200)
    const bloqueado = await as(app, client).get('/api/users')
    expect(bloqueado.status).toBe(403)
    expect((bloqueado.body as { error: { code: string } }).error.code).toBe('PASSWORD_CHANGE_REQUIRED')
  })

  it('cambiar la clave levanta el bloqueo y cierra las demas sesiones', async () => {
    await seedUser(db, seed, { username: 'nuevo', roles: ['ADMIN'], mustChangePassword: true })
    const app = buildApp(db)
    const otraSesion = await loginAs(app, 'nuevo')
    const client = await loginAs(app, 'nuevo')

    const cambio = await as(app, client).post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'una-clave-nueva-2026',
    })
    expect(cambio.status).toBe(204)

    expect((await as(app, client).get('/api/users')).status).toBe(200)
    expect((await as(app, otraSesion).get('/api/auth/me')).status).toBe(401)
    expect((await login(app, 'nuevo', PASSWORD)).status).toBe(401)
    expect((await login(app, 'nuevo', 'una-clave-nueva-2026')).status).toBe(200)
  })

  it('rechaza la clave actual incorrecta, la debil y la igual a la actual', async () => {
    const app = buildApp(db)
    const client = await loginAs(app, 'admin')
    const cambiar = (currentPassword: string, newPassword: string) =>
      as(app, client).post('/api/auth/change-password', { currentPassword, newPassword })

    const errorDe = (res: request.Response) => (res.body as { error: { code: string } }).error.code
    expect(errorDe(await cambiar('equivocada-1234', 'una-clave-nueva-2026'))).toBe('WRONG_CURRENT_PASSWORD')
    expect(errorDe(await cambiar(PASSWORD, 'corta'))).toBe('WEAK_PASSWORD')
    expect(errorDe(await cambiar(PASSWORD, PASSWORD))).toBe('SAME_PASSWORD')
  })

  it('marca el onboarding como completado', async () => {
    const app = buildApp(db)
    const client = await loginAs(app, 'admin')
    expect((await as(app, client).post('/api/auth/onboarding/complete')).status).toBe(204)
    const me = await as(app, client).get('/api/auth/me')
    expect((me.body as { user: { onboardingCompleted: boolean } }).user.onboardingCompleted).toBe(true)
  })
})
