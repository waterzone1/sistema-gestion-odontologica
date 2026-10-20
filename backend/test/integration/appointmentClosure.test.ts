import type request from 'supertest'
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
  type Seed,
} from '../helpers.js'

const db = testDb()
const app = buildApp(db)
let seed: Seed
let recepcion: Client
let odontologo: Client
let pacienteId: string
let perfilId: string
let recepcionId: string

interface Turno {
  id: string
  status: string
  billing: string
  closure: { reason: string | null; treatmentItem: { practice: string } | null } | null
}

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const pendientes = async () =>
  ((await as(app, recepcion).get('/api/billing/pending').expect(200)).body as { appointments: Turno[] }).appointments.map(
    (t) => t.id,
  )

async function turno(status: 'ATTENDED' | 'CANCELLED' | 'NO_SHOW' | 'SCHEDULED', desde = -120, duracion = 30) {
  return seedAppointment(db, seed, {
    patientId: pacienteId,
    professionalId: perfilId,
    createdById: recepcionId,
    startsAt: minutesFromNow(desde),
    endsAt: minutesFromNow(desde + duracion),
    status,
  })
}

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  recepcionId = (await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })).id
  perfilId = (await seedProfessional(db, seed, { username: 'odontologo', displayName: 'Dra. Paz' })).profile.id
  pacienteId = (await seedPatient(db, seed)).id
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
})

describe('reactivar turnos', () => {
  it('un cancelado o ausente vuelve a pendiente y pierde el motivo', async () => {
    const cancelado = await turno('CANCELLED', 60)
    await db.appointment.update({ where: { id: cancelado.id }, data: { cancellationReason: 'No puede venir' } })
    const res = await as(app, recepcion).post(`/api/appointments/${cancelado.id}/reactivate`, {}).expect(200)
    expect(res.body).toMatchObject({ status: 'SCHEDULED', cancellationReason: null })

    const ausente = await turno('NO_SHOW', 120)
    await as(app, recepcion).post(`/api/appointments/${ausente.id}/reactivate`, {}).expect(200)
    expect(await db.auditLog.count({ where: { action: 'APPOINTMENT_STATUS_CHANGED' } })).toBe(2)
  })

  it('no reactiva si el horario ya se ocupo con otro turno', async () => {
    const cancelado = await turno('CANCELLED', 60)
    await turno('SCHEDULED', 60)
    const res = await as(app, recepcion).post(`/api/appointments/${cancelado.id}/reactivate`, {})
    expect([res.status, codigo(res)]).toEqual([409, 'APPOINTMENT_CONFLICT'])
  })

  it('solo reactiva cancelados o ausentes, y el odontologo no puede', async () => {
    const pendiente = await turno('SCHEDULED', 60)
    const res = await as(app, recepcion).post(`/api/appointments/${pendiente.id}/reactivate`, {})
    expect(codigo(res)).toBe('INVALID_TRANSITION')
    const cancelado = await turno('CANCELLED', 180)
    expect((await as(app, odontologo).post(`/api/appointments/${cancelado.id}/reactivate`, {})).status).toBe(403)
  })
})

describe('cierre de turnos atendidos', () => {
  it('un turno atendido sin prestacion queda pendiente hasta registrarla', async () => {
    const atendido = await turno('ATTENDED')
    await turno('SCHEDULED', 60)
    expect(await pendientes()).toEqual([atendido.id])
    const detalle = (await as(app, recepcion).get(`/api/appointments/${atendido.id}`)).body as Turno
    expect(detalle.billing).toBe('PENDING')

    const practica = await seedPractice(db, seed)
    await as(app, recepcion)
      .post(`/api/patients/${pacienteId}/services`, {
        practiceId: practica.id,
        professionalId: perfilId,
        appointmentId: atendido.id,
      })
      .expect(201)
    expect(await pendientes()).toEqual([])
    expect(((await as(app, recepcion).get(`/api/appointments/${atendido.id}`)).body as Turno).billing).toBe('SERVICE')
  })

  it('se cierra sin cargo con motivo, o como sesion de un item del plan', async () => {
    const control = await turno('ATTENDED', -300)
    const sesion = await turno('ATTENDED', -120)
    const sinMotivo = await as(app, recepcion).post(`/api/appointments/${control.id}/close`, { kind: 'NO_CHARGE', reason: '' })
    expect(sinMotivo.status).toBe(400)
    const cerrado = await as(app, recepcion)
      .post(`/api/appointments/${control.id}/close`, { kind: 'NO_CHARGE', reason: 'Control post tratamiento' })
      .expect(200)
    expect(cerrado.body).toMatchObject({ billing: 'NO_CHARGE', closure: { reason: 'Control post tratamiento' } })

    const implante = await seedPractice(db, seed, { name: 'Implante' })
    const plan = (await as(app, odontologo).post(`/api/patients/${pacienteId}/treatment-plans`, {})).body as { id: string }
    const conItem = (
      await as(app, odontologo).post(`/api/patients/${pacienteId}/treatment-plans/${plan.id}/items`, { practiceId: implante.id })
    ).body as { items: { id: string }[] }
    const itemId = conItem.items[0]?.id
    const res = await as(app, recepcion)
      .post(`/api/appointments/${sesion.id}/close`, { kind: 'TREATMENT_SESSION', treatmentItemId: itemId })
      .expect(200)
    expect(res.body).toMatchObject({ billing: 'TREATMENT_SESSION', closure: { treatmentItem: { practice: 'Implante' } } })
    expect(await pendientes()).toEqual([])

    const otraVez = await as(app, recepcion).post(`/api/appointments/${control.id}/close`, { kind: 'NO_CHARGE', reason: 'Otra' })
    expect(codigo(otraVez)).toBe('NOT_PENDING')
  })

  it('rechaza items de otro paciente y turnos no atendidos', async () => {
    const atendido = await turno('ATTENDED')
    const otro = await seedPatient(db, seed, { documentNumber: '40111222' })
    const practica = await seedPractice(db, seed)
    const plan = (await as(app, odontologo).post(`/api/patients/${otro.id}/treatment-plans`, {})).body as { id: string }
    const conItem = (
      await as(app, odontologo).post(`/api/patients/${otro.id}/treatment-plans/${plan.id}/items`, { practiceId: practica.id })
    ).body as { items: { id: string }[] }
    const ajeno = await as(app, recepcion).post(`/api/appointments/${atendido.id}/close`, {
      kind: 'TREATMENT_SESSION',
      treatmentItemId: conItem.items[0]?.id,
    })
    expect(codigo(ajeno)).toBe('INVALID_TREATMENT_ITEM')

    const futuro = await turno('SCHEDULED', 60)
    const res = await as(app, recepcion).post(`/api/appointments/${futuro.id}/close`, { kind: 'NO_CHARGE', reason: 'Control' })
    expect(codigo(res)).toBe('NOT_PENDING')
  })
})
