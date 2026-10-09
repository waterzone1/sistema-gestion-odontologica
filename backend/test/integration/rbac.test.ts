import express from 'express'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { isGuarded, publicRoute } from '../../src/middleware/access.js'
import {
  as,
  buildApp,
  loginAs,
  resetDb,
  seedInstall,
  seedUser,
  testDb,
  type Client,
} from '../helpers.js'

const db = testDb()
const app = buildApp(db)

const FANTASMA = '00000000-0000-7000-8000-000000000000'

type ActorName = 'anonimo' | 'admin' | 'odontologo' | 'recepcion' | 'admin+odontologo'
type Expectation = 'permitido' | 'sin sesion' | 'prohibido'

const clients = new Map<ActorName, Client | null>()

beforeAll(async () => {
  await resetDb(db)
  const seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  await seedUser(db, seed, { username: 'odontologo', roles: ['DENTIST'] })
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  await seedUser(db, seed, { username: 'mixto', roles: ['ADMIN', 'DENTIST'] })
  clients.set('anonimo', null)
  clients.set('admin', await loginAs(app, 'admin'))
  clients.set('odontologo', await loginAs(app, 'odontologo'))
  clients.set('recepcion', await loginAs(app, 'recepcion'))
  clients.set('admin+odontologo', await loginAs(app, 'mixto'))
})

interface Endpoint {
  method: 'get' | 'post' | 'put' | 'patch'
  path: string
  body?: object
  allowed: ActorName[]
}

const SOLO_ADMIN: ActorName[] = ['admin', 'admin+odontologo']
const TODOS: ActorName[] = ['admin', 'odontologo', 'recepcion', 'admin+odontologo']
const SOLO_ODONTOLOGO: ActorName[] = ['odontologo', 'admin+odontologo']
const ADMIN_Y_RECEPCION: ActorName[] = ['admin', 'recepcion', 'admin+odontologo']

const ENDPOINTS: Endpoint[] = [
  { method: 'get', path: '/api/users', allowed: SOLO_ADMIN },
  { method: 'post', path: '/api/users', body: {}, allowed: SOLO_ADMIN },
  { method: 'get', path: `/api/users/${FANTASMA}`, allowed: SOLO_ADMIN },
  { method: 'patch', path: `/api/users/${FANTASMA}`, body: { displayName: 'Otro' }, allowed: SOLO_ADMIN },
  { method: 'post', path: `/api/users/${FANTASMA}/reset-password`, body: {}, allowed: SOLO_ADMIN },
  { method: 'post', path: `/api/users/${FANTASMA}/deactivate`, allowed: SOLO_ADMIN },
  { method: 'post', path: `/api/users/${FANTASMA}/activate`, allowed: SOLO_ADMIN },
  { method: 'post', path: `/api/users/${FANTASMA}/revoke-sessions`, allowed: SOLO_ADMIN },
  { method: 'get', path: '/api/branches', allowed: TODOS },
  { method: 'post', path: '/api/branches', body: {}, allowed: SOLO_ADMIN },
  { method: 'patch', path: `/api/branches/${FANTASMA}`, body: { name: 'Otra' }, allowed: SOLO_ADMIN },
  { method: 'get', path: '/api/professionals', allowed: TODOS },
  { method: 'put', path: `/api/professionals/${FANTASMA}`, body: {}, allowed: SOLO_ADMIN },
  { method: 'get', path: '/api/patients', allowed: TODOS },
  { method: 'post', path: '/api/patients', body: {}, allowed: ADMIN_Y_RECEPCION },
  { method: 'get', path: `/api/patients/${FANTASMA}`, allowed: TODOS },
  { method: 'patch', path: `/api/patients/${FANTASMA}`, body: { firstName: 'X' }, allowed: ADMIN_Y_RECEPCION },
  { method: 'post', path: `/api/patients/${FANTASMA}/archive`, allowed: ADMIN_Y_RECEPCION },
  { method: 'post', path: `/api/patients/${FANTASMA}/unarchive`, allowed: ADMIN_Y_RECEPCION },
  { method: 'get', path: '/api/practices', allowed: TODOS },
  { method: 'post', path: '/api/practices', body: {}, allowed: SOLO_ADMIN },
  { method: 'patch', path: `/api/practices/${FANTASMA}`, body: { name: 'X' }, allowed: SOLO_ADMIN },
  { method: 'get', path: '/api/appointments', allowed: TODOS },
  { method: 'post', path: '/api/appointments', body: {}, allowed: ADMIN_Y_RECEPCION },
  { method: 'get', path: `/api/appointments/${FANTASMA}`, allowed: TODOS },
  { method: 'patch', path: `/api/appointments/${FANTASMA}`, body: { notes: 'x' }, allowed: ADMIN_Y_RECEPCION },
  { method: 'post', path: `/api/appointments/${FANTASMA}/status`, body: { status: 'ATTENDED' }, allowed: TODOS },
  { method: 'get', path: `/api/patients/${FANTASMA}/clinical`, allowed: SOLO_ODONTOLOGO },
  { method: 'post', path: `/api/patients/${FANTASMA}/clinical`, body: { content: 'Control' }, allowed: SOLO_ODONTOLOGO },
  {
    method: 'post',
    path: `/api/patients/${FANTASMA}/clinical/${FANTASMA}/corrections`,
    body: { content: 'Correccion' },
    allowed: SOLO_ODONTOLOGO,
  },
  { method: 'get', path: `/api/patients/${FANTASMA}/services`, allowed: TODOS },
  { method: 'post', path: `/api/patients/${FANTASMA}/services`, body: {}, allowed: TODOS },
  {
    method: 'post',
    path: `/api/patients/${FANTASMA}/services/${FANTASMA}/price`,
    body: { price: '100' },
    allowed: ADMIN_Y_RECEPCION,
  },
  {
    method: 'post',
    path: `/api/patients/${FANTASMA}/services/${FANTASMA}/void`,
    body: { reason: 'Error de carga' },
    allowed: ADMIN_Y_RECEPCION,
  },
  { method: 'get', path: `/api/patients/${FANTASMA}/account`, allowed: ADMIN_Y_RECEPCION },
  { method: 'post', path: `/api/patients/${FANTASMA}/payments`, body: {}, allowed: ADMIN_Y_RECEPCION },
  {
    method: 'post',
    path: `/api/patients/${FANTASMA}/payments/${FANTASMA}/void`,
    body: { reason: 'Error de carga' },
    allowed: ADMIN_Y_RECEPCION,
  },
  {
    method: 'post',
    path: `/api/patients/${FANTASMA}/credits/${FANTASMA}/void`,
    body: { reason: 'Error de carga' },
    allowed: ADMIN_Y_RECEPCION,
  },
  { method: 'get', path: '/api/debtors', allowed: ADMIN_Y_RECEPCION },
  { method: 'get', path: '/api/auth/me', allowed: TODOS },
]

function expectationFor(endpoint: Endpoint, actor: ActorName): Expectation {
  if (actor === 'anonimo') return 'sin sesion'
  return endpoint.allowed.includes(actor) ? 'permitido' : 'prohibido'
}

async function call(endpoint: Endpoint, actor: ActorName): Promise<request.Response> {
  const client = clients.get(actor) ?? null
  if (!client) {
    const req = request(app)[endpoint.method](endpoint.path).set('Origin', 'https://test.local')
    return endpoint.body ? req.send(endpoint.body) : req
  }
  return as(app, client)[endpoint.method](endpoint.path, endpoint.body)
}

describe('matriz de autorizacion por rol', () => {
  const casos = ENDPOINTS.flatMap((endpoint) =>
    (['anonimo', 'admin', 'odontologo', 'recepcion', 'admin+odontologo'] as ActorName[]).map(
      (actor) => [endpoint.method.toUpperCase(), endpoint.path.replace(FANTASMA, ':id'), actor, endpoint, actor] as const,
    ),
  )

  it.each(casos)('%s %s como %s', async (_m, _p, _a, endpoint, actor) => {
    const res = await call(endpoint, actor)
    const esperado = expectationFor(endpoint, actor)
    if (esperado === 'sin sesion') expect(res.status).toBe(401)
    else if (esperado === 'prohibido') expect(res.status).toBe(403)
    else expect([401, 403]).not.toContain(res.status)
  })

  it('un usuario con dos roles tiene la union de sus permisos', async () => {
    const mixto = clients.get('admin+odontologo')
    const me = await as(app, mixto as Client).get('/api/auth/me')
    const permisos = (me.body as { user: { permissions: string[] } }).user.permissions
    expect(permisos).toEqual(expect.arrayContaining(['users:manage', 'professionals:read']))
  })
})

interface LayerLike {
  route?: { path: string; stack: { handle: unknown }[] }
  handle?: { stack?: LayerLike[] }
}

function unguardedRoutes(application: express.Express): string[] {
  const found: string[] = []
  let total = 0
  const walk = (stack: LayerLike[]): void => {
    for (const layer of stack) {
      if (layer.route) {
        total++
        if (!layer.route.stack.some((l) => isGuarded(l.handle))) found.push(layer.route.path)
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack)
      }
    }
  }
  walk((application as unknown as { router: { stack: LayerLike[] } }).router.stack)
  if (total === 0) throw new Error('no se encontraron rutas: el recorrido esta roto')
  return found
}

describe('deny by default', () => {
  it('toda ruta de la aplicacion declara su politica de acceso', () => {
    expect(unguardedRoutes(app)).toEqual([])
  })

  it('el detector encuentra una ruta sin politica (control del test)', () => {
    const fake = express()
    fake.get('/sin-guardia', (_req, res) => res.end())
    fake.get('/con-guardia', publicRoute(), (_req, res) => res.end())
    expect(unguardedRoutes(fake)).toEqual(['/sin-guardia'])
  })
})
