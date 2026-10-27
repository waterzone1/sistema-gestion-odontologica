import { beforeEach, describe, expect, it } from 'vitest'
import {
  as,
  buildApp,
  loginAs,
  minutesFromNow,
  resetDb,
  seedAppointment,
  seedInstall,
  seedPatient,
  seedPractice,
  seedProfessional,
  seedUser,
  testDb,
  type Client,
} from '../helpers.js'

const db = testDb()
const app = buildApp(db)
let recepcion: Client
let odontologo: Client
let pazId: string
let gilId: string
let pacienteId: string

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
const periodo = () => `from=2026-01-01&to=${hoy()}`

beforeEach(async () => {
  await resetDb(db)
  const seed = await seedInstall(db)
  const recepcionista = await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  pazId = (await seedProfessional(db, seed, { username: 'odontologo', displayName: 'Dra. Paz' })).profile.id
  gilId = (await seedProfessional(db, seed, { username: 'gil', displayName: 'Dr. Gil' })).profile.id
  pacienteId = (await seedPatient(db, seed)).id
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
  const turno = (professionalId: string, desde: number, status: 'ATTENDED' | 'NO_SHOW' | 'CANCELLED') =>
    seedAppointment(db, seed, {
      patientId: pacienteId,
      professionalId,
      createdById: recepcionista.id,
      startsAt: minutesFromNow(desde),
      endsAt: minutesFromNow(desde + 30),
      status,
    })
  await turno(pazId, -300, 'ATTENDED')
  await turno(pazId, -240, 'NO_SHOW')
  await turno(gilId, -180, 'CANCELLED')
  await turno(gilId, -120, 'ATTENDED')
  const consulta = await seedPractice(db, seed, { code: 'CON', name: 'Consulta', basePrice: '10000.00' })
  const limpieza = await seedPractice(db, seed, { code: 'LIM', name: 'Limpieza', basePrice: '25000.00' })
  for (const [practiceId, professionalId] of [
    [consulta.id, pazId],
    [consulta.id, gilId],
    [limpieza.id, pazId],
  ] as const) {
    await as(app, recepcion).post(`/api/patients/${pacienteId}/services`, { practiceId, professionalId }).expect(201)
  }
  await as(app, recepcion)
    .post(`/api/patients/${pacienteId}/payments`, { lines: [{ amount: '15000', method: 'CASH' }, { amount: '5000', method: 'TRANSFER' }] })
    .expect(201)
})

describe('reportes', () => {
  it('turnos por estado y por profesional', async () => {
    const res = await as(app, recepcion).get(`/api/reports/appointments?${periodo()}`).expect(200)
    expect(res.body).toMatchObject({ totals: { total: 4, attended: 2, noShow: 1, cancelled: 1 } })
    const filtrado = await as(app, recepcion).get(`/api/reports/appointments?${periodo()}&professionalId=${gilId}`).expect(200)
    expect(filtrado.body).toMatchObject({ totals: { total: 2, cancelled: 1, attended: 1 }, byProfessional: [{ professional: { displayName: 'Dr. Gil' } }] })
  })

  it('cobranzas por dia y por medio', async () => {
    const res = await as(app, recepcion).get(`/api/reports/collections?${periodo()}`).expect(200)
    expect(res.body).toMatchObject({ totalArs: '20000.00', byDay: [{ date: hoy(), count: 2, amountArs: '20000.00' }] })
    expect((res.body as { byMethod: unknown[] }).byMethod).toHaveLength(2)
  })

  it('prestaciones por profesional y practica, y saldos pendientes', async () => {
    const res = await as(app, recepcion).get(`/api/reports/services?${periodo()}`).expect(200)
    expect(res.body).toMatchObject({
      byProfessional: [{ professional: { displayName: 'Dra. Paz' }, count: 2, patientAmount: '35000.00' }, { count: 1 }],
      byPractice: [{ practice: { code: 'LIM' }, count: 1 }, { practice: { code: 'CON' }, count: 2 }],
    })
    const deudores = await as(app, recepcion).get('/api/reports/debtors').expect(200)
    expect(deudores.body).toMatchObject([{ balance: '25000.00' }])
  })

  it('valida el periodo y el odontologo no accede', async () => {
    await as(app, recepcion).get('/api/reports/appointments?from=2026-05-02&to=2026-05-01').expect(400)
    await as(app, recepcion).get('/api/reports/appointments?from=2024-01-01&to=2026-01-01').expect(400)
    expect((await as(app, odontologo).get(`/api/reports/collections?${periodo()}`)).status).toBe(403)
  })
})
