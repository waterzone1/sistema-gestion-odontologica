import { Writable } from 'node:stream'
import request from 'supertest'
import type { Express } from 'express'
import { createApp, type AppDeps } from '../src/app.js'
import { createSetupTokenStore } from '../src/modules/organizations/setupToken.js'
import type { Role } from '../src/modules/users/domain/permissions.js'
import { createDb, type Db } from '../src/shared/db.js'
import { hashPassword } from '../src/shared/password.js'
import { createLogger } from '../src/shared/logger.js'

export const ORIGIN = 'https://test.local'
export const PASSWORD = 'Clave-de-prueba-1'
export const SETUP_TOKEN = 'token-de-prueba'

export const silentLogger = createLogger({ level: 'silent' })

let sharedDb: Db | undefined
export function testDb(): Db {
  const url = process.env['TEST_DATABASE_URL']
  if (!url) throw new Error('falta TEST_DATABASE_URL (lo arma el globalSetup)')
  sharedDb ??= createDb(url)
  return sharedDb
}

export async function resetDb(db: Db): Promise<void> {
  // truncate no dispara el trigger append-only de la auditoria
  await db.$executeRawUnsafe(
    'TRUNCATE "AuditLog","Session","ProfessionalProfile","UserBranch","UserRole","User","Branch","Organization" CASCADE',
  )
}

export function buildApp(db: Db, overrides: Partial<AppDeps> = {}): Express {
  return createApp({
    db,
    logger: silentLogger,
    setupTokens: createSetupTokenStore(SETUP_TOKEN),
    appOrigin: ORIGIN,
    cookieSecure: false,
    loginRateLimit: { max: 1000, windowMs: 60_000 },
    ...overrides,
  })
}

// logger que guarda todo lo que escribe, para revisar que no se filtren secretos
export function capturingLogger() {
  const lines: string[] = []
  const destination = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString())
      cb()
    },
  })
  return { logger: createLogger({ level: 'debug', destination }), lines }
}

let cachedHash: Promise<string> | undefined

interface SeedUser {
  username: string
  roles: Role[]
  branchIds?: string[]
  active?: boolean
  mustChangePassword?: boolean
  displayName?: string
}

export interface Seed {
  organizationId: string
  branchId: string
  secondBranchId: string
}

// organizacion con dos sedes; los usuarios se agregan con seedUser
export async function seedInstall(db: Db): Promise<Seed> {
  const organization = await db.organization.create({ data: { name: 'Consultorio de Prueba' } })
  const branch = await db.branch.create({
    data: { organizationId: organization.id, name: 'Sede Central' },
  })
  const second = await db.branch.create({
    data: { organizationId: organization.id, name: 'Sede Norte' },
  })
  return { organizationId: organization.id, branchId: branch.id, secondBranchId: second.id }
}

export async function seedUser(db: Db, seed: Seed, user: SeedUser) {
  cachedHash ??= hashPassword(PASSWORD)
  const branchIds = user.branchIds ?? [seed.branchId]
  return db.user.create({
    data: {
      organizationId: seed.organizationId,
      username: user.username,
      displayName: user.displayName ?? user.username,
      passwordHash: await cachedHash,
      active: user.active ?? true,
      mustChangePassword: user.mustChangePassword ?? false,
      roles: { create: user.roles.map((role) => ({ role })) },
      branches: { create: branchIds.map((branchId) => ({ branchId })) },
    },
  })
}

export interface Client {
  cookie: string
  csrfToken: string
  userId: string
}

export async function loginAs(app: Express, username: string, password = PASSWORD): Promise<Client> {
  const res = await request(app)
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username, password })
  if (res.status !== 200) throw new Error(`login fallo (${res.status}): ${JSON.stringify(res.body)}`)
  const cookies = res.headers['set-cookie'] as unknown as string[]
  const sid = cookies.find((c) => c.startsWith('sid='))
  if (!sid) throw new Error('el login no devolvio la cookie de sesion')
  const body = res.body as { user: { id: string }; csrfToken: string }
  return { cookie: sid.split(';')[0] ?? '', csrfToken: body.csrfToken, userId: body.user.id }
}

// llamadas autenticadas: agregan cookie, origin y token csrf como lo haria el navegador
export function as(app: Express, client: Client) {
  const withAuth = (req: request.Test, write: boolean) => {
    req.set('Cookie', client.cookie)
    if (write) req.set('Origin', ORIGIN).set('X-CSRF-Token', client.csrfToken)
    return req
  }
  return {
    get: (path: string) => withAuth(request(app).get(path), false),
    post: (path: string, body?: object) => withAuth(request(app).post(path), true).send(body),
    put: (path: string, body?: object) => withAuth(request(app).put(path), true).send(body),
    patch: (path: string, body?: object) => withAuth(request(app).patch(path), true).send(body),
  }
}
