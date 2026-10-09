import type request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { fromLocal } from '../../src/modules/availability/domain/availability.js'
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
const TZ = 'America/Argentina/Buenos_Aires'
const LUNES = '2030-06-10'
const SABADO = '2030-06-15'

let seed: Seed
let admin: Client
let recepcion: Client
let odontologo: Client
let perfilId: string
let pacienteId: string

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const hora = (dia: string, hh: number, mm = 0) => fromLocal(dia, hh * 60 + mm, TZ).toISOString()
const reglas = (id = perfilId) => `/api/professionals/${id}/availability/rules`
const excepciones = (id = perfilId) => `/api/professionals/${id}/exceptions`

const turno = (dia: string, hh: number, extra: Record<string, unknown> = {}) => ({
  patientId: pacienteId,
  professionalId: perfilId,
  branchId: seed.branchId,
  startsAt: hora(dia, hh),
  endsAt: hora(dia, hh, 30),
  ...extra,
})

const horarioBase = () => ({
  rules: [
    { branchId: seed.branchId, weekday: 1, start: '09:00', end: '13:00' },
    { branchId: seed.branchId, weekday: 1, start: '14:00', end: '18:00' },
    { branchId: seed.secondBranchId, weekday: 3, start: '08:00', end: '12:00' },
  ],
})

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  perfilId = (
    await seedProfessional(db, seed, {
      username: 'odontologo',
      displayName: 'Dra. Paz',
      branchIds: [seed.branchId, seed.secondBranchId],
      fullAvailability: false,
    })
  ).profile.id
  pacienteId = (await seedPatient(db, seed)).id
  admin = await loginAs(app, 'admin')
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
})

describe('horario semanal', () => {
  it('administracion carga el horario y todos lo pueden consultar', async () => {
    const res = await as(app, admin).put(reglas(), horarioBase())
    expect(res.status).toBe(200)
    const vista = await as(app, recepcion).get(`/api/professionals/${perfilId}/availability`)
    expect((vista.body as { rules: unknown[] }).rules).toEqual([
      expect.objectContaining({ weekday: 1, start: '09:00', end: '13:00', branchId: seed.branchId }),
      expect.objectContaining({ weekday: 1, start: '14:00', end: '18:00' }),
      expect.objectContaining({ weekday: 3, start: '08:00', end: '12:00', branchId: seed.secondBranchId }),
    ])
    expect(await db.auditLog.count({ where: { action: 'AVAILABILITY_RULES_CHANGED' } })).toBe(1)
  })

  it('solo administracion edita el horario', async () => {
    for (const cliente of [recepcion, odontologo]) {
      expect((await as(app, cliente).put(reglas(), horarioBase())).status).toBe(403)
    }
  })

  it('rechaza franjas superpuestas, invertidas o en sedes ajenas', async () => {
    const superpuesta = await as(app, admin).put(reglas(), {
      rules: [
        { branchId: seed.branchId, weekday: 1, start: '09:00', end: '13:00' },
        { branchId: seed.secondBranchId, weekday: 1, start: '12:00', end: '15:00' },
      ],
    })
    expect([superpuesta.status, codigo(superpuesta)]).toEqual([422, 'INVALID_AVAILABILITY'])
    const invertida = await as(app, admin).put(reglas(), {
      rules: [{ branchId: seed.branchId, weekday: 1, start: '13:00', end: '09:00' }],
    })
    expect(invertida.status).toBe(422)
    const otra = await db.branch.create({ data: { organizationId: seed.organizationId, name: 'Sede Sur' } })
    const ajena = await as(app, admin).put(reglas(), { rules: [{ branchId: otra.id, weekday: 2, start: '09:00', end: '10:00' }] })
    expect([ajena.status, codigo(ajena)]).toEqual([422, 'PROFESSIONAL_NOT_IN_BRANCH'])
  })
})

describe('turnos y disponibilidad', () => {
  beforeEach(async () => {
    await as(app, admin).put(reglas(), horarioBase()).expect(200)
  })

  it('acepta turnos dentro del horario y rechaza los de afuera', async () => {
    expect((await as(app, recepcion).post('/api/appointments', turno(LUNES, 10))).status).toBe(201)
    const almuerzo = await as(app, recepcion).post('/api/appointments', turno(LUNES, 13))
    expect([almuerzo.status, codigo(almuerzo)]).toEqual([422, 'OUTSIDE_AVAILABILITY'])
    const otraSede = await as(app, admin).post('/api/appointments', turno(LUNES, 10, { branchId: seed.secondBranchId }))
    expect(otraSede.status).toBe(422)
  })

  it('reprogramar tambien respeta el horario', async () => {
    const creado = (await as(app, recepcion).post('/api/appointments', turno(LUNES, 10))).body as { id: string }
    const fuera = await as(app, recepcion).patch(`/api/appointments/${creado.id}`, {
      startsAt: hora(LUNES, 19),
      endsAt: hora(LUNES, 19, 30),
    })
    expect(codigo(fuera)).toBe('OUTSIDE_AVAILABILITY')
    const notas = await as(app, recepcion).patch(`/api/appointments/${creado.id}`, { notes: 'Trae estudios' })
    expect(notas.status).toBe(200)
  })

  it('las vacaciones bloquean, avisan los turnos afectados y se pueden revocar', async () => {
    await as(app, recepcion).post('/api/appointments', turno(LUNES, 10)).expect(201)
    const vacaciones = await as(app, recepcion).post(excepciones(), {
      type: 'VACATION',
      startsAt: hora(LUNES, 0),
      endsAt: hora('2030-06-17', 0),
      reason: 'Vacaciones de invierno',
    })
    expect(vacaciones.status).toBe(201)
    const cuerpo = vacaciones.body as { exception: { id: string }; conflicts: { startsAt: string }[] }
    expect(cuerpo.conflicts).toHaveLength(1)

    const bloqueado = await as(app, recepcion).post('/api/appointments', turno(LUNES, 11))
    expect(bloqueado.body).toMatchObject({ error: { code: 'OUTSIDE_AVAILABILITY', message: expect.stringContaining('vacaciones') as string } })

    await as(app, recepcion).post(`${excepciones()}/${cuerpo.exception.id}/revoke`).expect(204)
    expect((await as(app, recepcion).post('/api/appointments', turno(LUNES, 11))).status).toBe(201)
    expect(await db.availabilityException.count()).toBe(1)
  })

  it('un horario extraordinario habilita un sabado en una sede', async () => {
    expect((await as(app, recepcion).post('/api/appointments', turno(SABADO, 10))).status).toBe(422)
    const extra = await as(app, recepcion).post(excepciones(), {
      type: 'EXTRA',
      branchId: seed.branchId,
      startsAt: hora(SABADO, 9),
      endsAt: hora(SABADO, 13),
      reason: 'Guardia del sábado',
    })
    expect(extra.status).toBe(201)
    expect((await as(app, recepcion).post('/api/appointments', turno(SABADO, 10))).status).toBe(201)
  })

  it('un horario extraordinario exige sede y el odontologo no carga excepciones', async () => {
    const sinSede = await as(app, recepcion).post(excepciones(), {
      type: 'EXTRA',
      startsAt: hora(SABADO, 9),
      endsAt: hora(SABADO, 13),
      reason: 'Guardia',
    })
    expect(sinSede.status).toBe(400)
    const odonto = await as(app, odontologo).post(excepciones(), {
      type: 'BLOCK',
      startsAt: hora(SABADO, 9),
      endsAt: hora(SABADO, 13),
      reason: 'Curso',
    })
    expect(odonto.status).toBe(403)
  })
})

describe('override de administracion', () => {
  beforeEach(async () => {
    await as(app, admin).put(reglas(), horarioBase()).expect(200)
  })

  it('solo administracion puede dar un turno fuera de horario, con motivo y auditado', async () => {
    const override = { reason: 'Urgencia por dolor agudo' }
    const deRecepcion = await as(app, recepcion).post('/api/appointments', turno(LUNES, 20, { override }))
    expect(deRecepcion.status).toBe(403)
    const sinMotivo = await as(app, admin).post('/api/appointments', turno(LUNES, 20, { override: { reason: '' } }))
    expect(sinMotivo.status).toBe(400)
    const res = await as(app, admin).post('/api/appointments', turno(LUNES, 20, { override }))
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ availabilityOverride: true, overrideReason: 'Urgencia por dolor agudo' })
    const auditoria = await db.auditLog.findFirstOrThrow({ where: { action: 'APPOINTMENT_AVAILABILITY_OVERRIDE' } })
    expect(auditoria.metadata).toMatchObject({ motivo: 'Urgencia por dolor agudo' })
  })

  it('el override nunca permite superponer turnos', async () => {
    const override = { reason: 'Urgencia por dolor agudo' }
    await as(app, admin).post('/api/appointments', turno(LUNES, 20, { override })).expect(201)
    const encima = await as(app, admin).post('/api/appointments', turno(LUNES, 20, { override }))
    expect([encima.status, codigo(encima)]).toEqual([409, 'APPOINTMENT_CONFLICT'])
  })
})

describe('agenda: franjas por sede', () => {
  it('devuelve las franjas disponibles y bloqueadas del rango', async () => {
    await as(app, admin).put(reglas(), horarioBase()).expect(200)
    await as(app, recepcion)
      .post(excepciones(), { type: 'BLOCK', startsAt: hora(LUNES, 15), endsAt: hora(LUNES, 16), reason: 'Reunión' })
      .expect(201)
    const desde = encodeURIComponent(hora(LUNES, 0))
    const hasta = encodeURIComponent(hora('2030-06-17', 0))
    const res = await as(app, recepcion).get(`/api/availability?from=${desde}&to=${hasta}&branchId=${seed.branchId}`)
    expect(res.status).toBe(200)
    const [profesional] = res.body as { professionalId: string; available: { start: string }[]; blocked: { reason: string }[] }[]
    expect(profesional?.professionalId).toBe(perfilId)
    expect(profesional?.available.map((f) => f.start)).toEqual([hora(LUNES, 9), hora(LUNES, 14)])
    expect(profesional?.blocked.map((b) => b.reason)).toEqual(['Reunión'])
  })
})

describe('practicas por profesional', () => {
  it('guarda telefono, email y practicas, y restringe los turnos a esas practicas', async () => {
    await as(app, admin).put(reglas(), horarioBase()).expect(200)
    const consulta = await seedPractice(db, seed, { code: 'CON' })
    const blanqueo = await seedPractice(db, seed, { code: 'BLA' })
    const usuario = await db.professionalProfile.findUniqueOrThrow({ where: { id: perfilId } })
    const libre = await as(app, recepcion).post('/api/appointments', turno(LUNES, 9, { practiceId: blanqueo.id }))
    expect(libre.status).toBe(201)

    const guardado = await as(app, admin).put(`/api/professionals/${usuario.userId}`, {
      licenseNumber: 'MP-77',
      phone: '11 4000-1234',
      email: 'paz@consultorio.test',
      practiceIds: [consulta.id],
    })
    expect(guardado.status).toBe(200)
    expect(guardado.body).toMatchObject({ phone: '11 4000-1234', email: 'paz@consultorio.test', practiceIds: [consulta.id] })

    const noRealiza = await as(app, recepcion).post('/api/appointments', turno(LUNES, 10, { practiceId: blanqueo.id }))
    expect([noRealiza.status, codigo(noRealiza)]).toEqual([422, 'PRACTICE_NOT_OFFERED'])
    expect((await as(app, recepcion).post('/api/appointments', turno(LUNES, 10, { practiceId: consulta.id }))).status).toBe(201)
    expect((await as(app, recepcion).post('/api/appointments', turno(LUNES, 11))).status).toBe(201)
  })

  it('valida email y practicas inexistentes', async () => {
    const usuario = await db.professionalProfile.findUniqueOrThrow({ where: { id: perfilId } })
    const email = await as(app, admin).put(`/api/professionals/${usuario.userId}`, { licenseNumber: 'MP-1', email: 'no-es-email' })
    expect(email.status).toBe(400)
    const practica = await as(app, admin).put(`/api/professionals/${usuario.userId}`, {
      licenseNumber: 'MP-1',
      practiceIds: ['00000000-0000-7000-8000-000000000000'],
    })
    expect([practica.status, codigo(practica)]).toEqual([422, 'INVALID_PRACTICE'])
  })
})
