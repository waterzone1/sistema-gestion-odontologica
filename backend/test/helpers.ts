import { tmpdir } from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
import request from 'supertest'
import type { Express } from 'express'
import { createApp, type AppDeps } from '../src/app.js'
import { createSetupTokenStore } from '../src/modules/organizations/setupToken.js'
import type { Role } from '../src/modules/users/domain/permissions.js'
import { createDb, type Db } from '../src/shared/db.js'
import { hashPassword } from '../src/shared/password.js'
import { createLogger } from '../src/shared/logger.js'
import { buildSearchText } from '../src/modules/patients/domain/search.js'

export const ORIGIN = 'https://test.local'
export const PASSWORD = 'Clave-de-prueba-1'
export const SETUP_TOKEN = 'token-de-prueba'
export const TEST_FILES = { dir: path.join(tmpdir(), `sgo-archivos-${process.pid}`), maxBytes: 64 * 1024 }

const silentLogger = createLogger({ level: 'silent' })

let sharedDb: Db | undefined
export function testDb(): Db {
  const url = process.env['TEST_DATABASE_URL']
  if (!url) throw new Error('falta TEST_DATABASE_URL (lo arma el globalSetup)')
  sharedDb ??= createDb(url)
  return sharedDb
}

export async function resetDb(db: Db): Promise<void> {
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
    files: TEST_FILES,
    ...overrides,
  })
}

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

interface SeedPatient {
  firstName?: string
  lastName?: string
  documentNumber?: string | null
  phone?: string | null
  archived?: boolean
}

let patientCounter = 0

export async function seedPatient(db: Db, seed: Seed, data: SeedPatient = {}) {
  patientCounter += 1
  const firstName = data.firstName ?? 'Paciente'
  const lastName = data.lastName ?? `Numero${patientCounter}`
  const documentNumber =
    data.documentNumber === undefined ? String(20000000 + patientCounter) : data.documentNumber
  const phone = data.phone === undefined ? null : data.phone
  return db.patient.create({
    data: {
      organizationId: seed.organizationId,
      firstName,
      lastName,
      documentNumber,
      phone,
      searchText: buildSearchText({ firstName, lastName, documentNumber, phone }),
      archivedAt: data.archived ? new Date() : null,
    },
  })
}

let professionalCounter = 0

export async function seedProfessional(
  db: Db,
  seed: Seed,
  data: { username: string; displayName?: string; branchIds?: string[]; fullAvailability?: boolean },
) {
  professionalCounter += 1
  const user = await seedUser(db, seed, {
    username: data.username,
    displayName: data.displayName ?? data.username,
    roles: ['DENTIST'],
    ...(data.branchIds ? { branchIds: data.branchIds } : {}),
  })
  const profile = await db.professionalProfile.create({
    data: { userId: user.id, licenseNumber: `MP-${professionalCounter}` },
  })
  if (data.fullAvailability ?? true) {
    await db.availabilityRule.createMany({
      data: (data.branchIds ?? [seed.branchId]).flatMap((branchId) =>
        [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          professionalId: profile.id,
          branchId,
          weekday,
          startMinute: 0,
          endMinute: 1440,
        })),
      ),
    })
  }
  return { user, profile }
}

let practiceCounter = 0

export async function seedPractice(
  db: Db,
  seed: Seed,
  data: { code?: string; name?: string; basePrice?: string; minutes?: number; active?: boolean } = {},
) {
  practiceCounter += 1
  return db.practice.create({
    data: {
      organizationId: seed.organizationId,
      code: data.code ?? `P${practiceCounter}`,
      name: data.name ?? `Practica ${practiceCounter}`,
      basePrice: data.basePrice ?? '10000.00',
      defaultDurationMinutes: data.minutes ?? 30,
      active: data.active ?? true,
    },
  })
}

export function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000)
}

export async function seedAppointment(
  db: Db,
  seed: Seed,
  data: {
    patientId: string
    professionalId: string
    createdById: string
    startsAt: Date
    endsAt: Date
    branchId?: string
    status?: 'SCHEDULED' | 'CONFIRMED' | 'ATTENDED' | 'NO_SHOW' | 'CANCELLED'
  },
) {
  return db.appointment.create({
    data: {
      organizationId: seed.organizationId,
      branchId: data.branchId ?? seed.branchId,
      patientId: data.patientId,
      professionalId: data.professionalId,
      createdById: data.createdById,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      status: data.status ?? 'SCHEDULED',
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
