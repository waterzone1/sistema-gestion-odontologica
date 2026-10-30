import type request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  as,
  buildApp,
  loginAs,
  resetDb,
  seedInstall,
  seedPatient,
  seedPractice,
  seedProfessional,
  seedUser,
  testDb,
  type Client,
  type Seed,
} from '../helpers.js'

const db = testDb()
const app = buildApp(db)
let seed: Seed
let recepcion: Client
let odontologo: Client
let pacienteId: string
let perfilId: string
let consulta: { id: string }
let extraccion: { id: string }

interface Proveedor {
  id: string
  plans: { id: string; name: string }[]
}

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())

async function planConConvenio(items = [{ practiceId: consulta.id, insurerAmount: '7000', patientCopay: '3000' }]) {
  const proveedor = (await as(app, recepcion).post('/api/coverages/providers', { name: 'OSDE', kind: 'PREPAGA' }).expect(201))
    .body as Proveedor
  const conPlan = (await as(app, recepcion).post(`/api/coverages/providers/${proveedor.id}/plans`, { name: '210' }).expect(201))
    .body as Proveedor
  const planId = conPlan.plans[0]?.id ?? ''
  await as(app, recepcion)
    .post(`/api/coverages/plans/${planId}/agreements`, { validFrom: '2026-01-01', items })
    .expect(201)
  return planId
}

const asignar = (planId: string, extra: Record<string, unknown> = {}) =>
  as(app, recepcion).post(`/api/patients/${pacienteId}/coverages`, {
    planId,
    affiliateNumber: '123-456',
    validFrom: '2026-01-01',
    ...extra,
  })

const registrar = (practiceId: string, extra: Record<string, unknown> = {}) =>
  as(app, recepcion).post(`/api/patients/${pacienteId}/services`, { practiceId, professionalId: perfilId, ...extra })

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  perfilId = (await seedProfessional(db, seed, { username: 'odontologo' })).profile.id
  pacienteId = (await seedPatient(db, seed)).id
  consulta = await seedPractice(db, seed, { code: 'CON', name: 'Consulta', basePrice: '10000.00' })
  extraccion = await seedPractice(db, seed, { code: 'EXT', name: 'Extracción', basePrice: '20000.00' })
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
})

describe('coberturas y convenios', () => {
  it('recepcion da de alta cobertura, plan y convenio; el odontologo no administra', async () => {
    const planId = await planConConvenio()
    const convenios = (await as(app, recepcion).get(`/api/coverages/plans/${planId}/agreements`).expect(200)).body as {
      items: { practice: { code: string }; insurerAmount: string; patientCopay: string }[]
    }[]
    expect(convenios[0]?.items).toMatchObject([{ practice: { code: 'CON' }, insurerAmount: '7000.00', patientCopay: '3000.00' }])
    expect((await as(app, odontologo).post('/api/coverages/providers', { name: 'IOMA', kind: 'OBRA_SOCIAL' })).status).toBe(403)
    expect((await as(app, odontologo).get(`/api/coverages/plans/${planId}/agreements`)).status).toBe(403)
    expect((await as(app, odontologo).get('/api/coverages')).status).toBe(200)
  })

  it('no deja superponer convenios del mismo plan ni repetir nombres', async () => {
    const planId = await planConConvenio()
    const superpuesto = await as(app, recepcion).post(`/api/coverages/plans/${planId}/agreements`, {
      validFrom: '2026-06-01',
      items: [{ practiceId: consulta.id, insurerAmount: '1', patientCopay: '1' }],
    })
    expect([superpuesto.status, codigo(superpuesto)]).toEqual([409, 'AGREEMENT_OVERLAP'])
    const repetido = await as(app, recepcion).post('/api/coverages/providers', { name: 'OSDE', kind: 'PREPAGA' })
    expect(codigo(repetido)).toBe('DUPLICATE_NAME')
  })

  it('una nueva cobertura principal archiva la anterior y la base no deja borrarlas', async () => {
    const planId = await planConConvenio()
    const primera = (await asignar(planId).expect(201)).body as { id: string }
    await asignar(planId, { affiliateNumber: '999' }).expect(201)
    const lista = (await as(app, recepcion).get(`/api/patients/${pacienteId}/coverages`).expect(200)).body as {
      affiliateNumber: string
      archived: boolean
    }[]
    expect(lista.map((c) => [c.affiliateNumber, c.archived])).toEqual([
      ['999', false],
      ['123-456', true],
    ])
    await expect(db.patientCoverage.delete({ where: { id: primera.id } })).rejects.toThrow()
    await expect(db.patientCoverage.update({ where: { id: primera.id }, data: { affiliateNumber: 'X' } })).rejects.toThrow()
  })
})

describe('prestaciones con cobertura', () => {
  it('al paciente le queda el coseguro y el resto queda a cargo de la cobertura', async () => {
    await asignar(await planConConvenio()).expect(201)
    const res = await registrar(consulta.id).expect(201)
    expect(res.body).toMatchObject({
      price: '3000.00',
      coverageAmount: '7000.00',
      coverage: { provider: 'OSDE', plan: '210', affiliateNumber: '123-456' },
    })
    const cuenta = (await as(app, recepcion).get(`/api/patients/${pacienteId}/account`).expect(200)).body as { balance: string }
    expect(cuenta.balance).toBe('3000.00')

    const sinConvenio = await registrar(extraccion.id).expect(201)
    expect(sinConvenio.body).toMatchObject({ price: '20000.00', coverageAmount: '0.00', coverage: null })
    const particular = await registrar(consulta.id, { applyCoverage: false }).expect(201)
    expect(particular.body).toMatchObject({ price: '10000.00', coverageAmount: '0.00' })
  })

  it('exige autorizacion si el convenio la pide y no aplica fuera de vigencia', async () => {
    const planId = await planConConvenio([{ practiceId: consulta.id, insurerAmount: '10000', patientCopay: '0' }])
    await as(app, recepcion)
      .put(`/api/coverages/agreements/${((await as(app, recepcion).get(`/api/coverages/plans/${planId}/agreements`)).body as { id: string }[])[0]?.id}`, {
        items: [{ practiceId: consulta.id, insurerAmount: '10000', patientCopay: '0', requiresAuthorization: true }],
      })
      .expect(200)
    await asignar(planId).expect(201)
    const sinCodigo = await registrar(consulta.id)
    expect([sinCodigo.status, codigo(sinCodigo)]).toEqual([422, 'AUTHORIZATION_REQUIRED'])
    const conCodigo = await registrar(consulta.id, { authorizationCode: 'AUT-77' }).expect(201)
    expect(conCodigo.body).toMatchObject({ price: '0.00', coverageAmount: '10000.00', authorizationCode: 'AUT-77' })

    const vieja = await registrar(consulta.id, { performedAt: '2025-12-15T15:00:00.000Z' }).expect(201)
    expect(vieja.body).toMatchObject({ coverageAmount: '0.00', price: '10000.00' })
  })

  it('cotiza lo que cubre la cobertura vigente, sin importes para el odontologo', async () => {
    await asignar(await planConConvenio()).expect(201)
    const ruta = `/api/patients/${pacienteId}/coverage-quote?practiceId=${consulta.id}&date=${hoy()}`
    expect((await as(app, recepcion).get(ruta).expect(200)).body).toMatchObject({
      coverage: { provider: { name: 'OSDE' }, plan: { name: '210' } },
      insurerAmount: '7000.00',
      patientCopay: '3000.00',
    })
    expect((await as(app, odontologo).get(ruta).expect(200)).body).toMatchObject({ insurerAmount: null, patientCopay: null })
  })
})

describe('modulo de coberturas', () => {
  it('apagado oculta y rechaza coberturas y liquidaciones, y cobra completo al paciente', async () => {
    await asignar(await planConConvenio()).expect(201)
    await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
    const admin = await loginAs(app, 'admin')
    await as(app, recepcion).put('/api/organization/modules', { coverages: false }).expect(403)
    expect((await as(app, admin).put('/api/organization/modules', { coverages: false }).expect(200)).body).toEqual({ coverages: false })

    const sesion = (await as(app, recepcion).get('/api/auth/me').expect(200)).body as { user: { permissions: string[]; modules: { coverages: boolean } } }
    expect(sesion.user.modules).toEqual({ coverages: false })
    expect(sesion.user.permissions).not.toContain('coverages:manage')
    expect(sesion.user.permissions).not.toContain('liquidations:manage')
    for (const ruta of ['/api/coverages', '/api/liquidations', `/api/patients/${pacienteId}/coverages`]) {
      const res = await as(app, recepcion).get(ruta)
      expect([res.status, codigo(res)]).toEqual([403, 'MODULE_DISABLED'])
    }
    expect((await registrar(consulta.id).expect(201)).body).toMatchObject({ price: '10000.00', coverageAmount: '0.00', coverage: null })

    await as(app, admin).put('/api/organization/modules', { coverages: true }).expect(200)
    expect((await as(app, recepcion).get(`/api/patients/${pacienteId}/coverages`).expect(200)).body).toHaveLength(1)
    expect(await db.auditLog.count({ where: { action: 'ORGANIZATION_MODULES_UPDATED' } })).toBe(2)
  })

  it('una instalacion nueva arranca con el modulo apagado', async () => {
    const [columna] = await db.$queryRaw<{ column_default: string }[]>`SELECT column_default FROM information_schema.columns WHERE table_name = 'Organization' AND column_name = 'coveragesEnabled'`
    expect(columna?.column_default).toBe('false')
  })
})
