import type request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  as,
  buildApp,
  loginAs,
  resetDb,
  seedAppointment,
  seedInstall,
  seedPatient,
  seedProfessional,
  seedUser,
  testDb,
  type Client,
} from '../helpers.js'

const db = testDb()
const app = buildApp(db)
let recepcion: Client
let odontologo: Client
let manana: string

interface Dia {
  date: string
  reminders: { id: string; status: string; whatsappUrl: string | null; failureReason: string | null; patient: { fullName: string } }[]
}

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const zona = 'America/Argentina/Buenos_Aires'

beforeEach(async () => {
  await resetDb(db)
  const seed = await seedInstall(db)
  const recepcionista = await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  const perfil = (await seedProfessional(db, seed, { username: 'odontologo', displayName: 'Dra. Paz' })).profile.id
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
  manana = new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(new Date(Date.now() + 86_400_000))
  const conCelular = await seedPatient(db, seed, { firstName: 'Ana', lastName: 'Gómez', phone: '11 5555-1234' })
  const sinCelular = await seedPatient(db, seed, { firstName: 'Beto', lastName: 'Ruiz', phone: null })
  const cancelado = await seedPatient(db, seed, { firstName: 'Ceci', lastName: 'Paz', phone: '11 4444-1234' })
  const turno = (patientId: string, hora: number, status: 'SCHEDULED' | 'CANCELLED' = 'SCHEDULED') =>
    seedAppointment(db, seed, {
      patientId,
      professionalId: perfil,
      createdById: recepcionista.id,
      startsAt: new Date(`${manana}T${String(hora).padStart(2, '0')}:00:00-03:00`),
      endsAt: new Date(`${manana}T${String(hora).padStart(2, '0')}:30:00-03:00`),
      status,
    })
  await turno(conCelular.id, 10)
  await turno(sinCelular.id, 11)
  await turno(cancelado.id, 12, 'CANCELLED')
})

describe('recordatorios de turnos', () => {
  it('genera uno por turno vigente de manana y no los duplica', async () => {
    const dia = (await as(app, recepcion).post('/api/reminders/generate', {}).expect(200)).body as Dia
    expect(dia.date).toBe(manana)
    expect(dia.reminders.map((r) => [r.patient.fullName, r.status])).toEqual([
      ['Gómez, Ana', 'PENDING'],
      ['Ruiz, Beto', 'FAILED'],
    ])
    expect(dia.reminders[0]?.whatsappUrl).toMatch(/^https:\/\/wa\.me\/5491155551234\?text=Hola%20Ana/)
    expect(dia.reminders[1]?.failureReason).toContain('celular')
    await as(app, recepcion).post('/api/reminders/generate', {}).expect(200)
    expect(await db.reminder.count()).toBe(2)
  })

  it('enviado y confirmado: confirmar tambien confirma el turno', async () => {
    const dia = (await as(app, recepcion).post('/api/reminders/generate', {}).expect(200)).body as Dia
    const id = dia.reminders[0]?.id ?? ''
    expect((await as(app, recepcion).post(`/api/reminders/${id}/sent`).expect(200)).body).toMatchObject({ status: 'SENT' })
    const confirmado = await as(app, recepcion).post(`/api/reminders/${id}/confirm`).expect(200)
    expect(confirmado.body).toMatchObject({ status: 'CONFIRMED', appointment: { status: 'CONFIRMED' } })
    const descartar = await as(app, recepcion).post(`/api/reminders/${id}/cancel`)
    expect(codigo(descartar)).toBe('INVALID_REMINDER_STATUS')
  })

  it('un turno cancelado despues muestra el recordatorio como cancelado; el odontologo no accede', async () => {
    const dia = (await as(app, recepcion).post('/api/reminders/generate', {}).expect(200)).body as Dia
    const reminder = await db.reminder.findUniqueOrThrow({ where: { id: dia.reminders[0]?.id ?? '' } })
    await db.appointment.update({ where: { id: reminder.appointmentId }, data: { status: 'CANCELLED', cancellationReason: 'No viene' } })
    const lista = (await as(app, recepcion).get(`/api/reminders?date=${manana}`).expect(200)).body as Dia
    expect(lista.reminders[0]?.status).toBe('CANCELLED')
    expect((await as(app, odontologo).get(`/api/reminders?date=${manana}`)).status).toBe(403)
    await expect(db.reminder.delete({ where: { id: reminder.id } })).rejects.toThrow()
  })

  it('si el turno se reprograma, el recordatorio viejo queda descartado y se genera uno nuevo', async () => {
    const dia = (await as(app, recepcion).post('/api/reminders/generate', {}).expect(200)).body as Dia
    const viejo = await db.reminder.findUniqueOrThrow({ where: { id: dia.reminders[0]?.id ?? '' } })
    const turno = await db.appointment.findUniqueOrThrow({ where: { id: viejo.appointmentId } })
    const dosDias = 2 * 86_400_000
    await db.appointment.update({
      where: { id: turno.id },
      data: { startsAt: new Date(turno.startsAt.getTime() + dosDias), endsAt: new Date(turno.endsAt.getTime() + dosDias) },
    })
    const lista = (await as(app, recepcion).get(`/api/reminders?date=${manana}`).expect(200)).body as Dia
    const movido = lista.reminders.find((r) => r.patient.fullName === 'Gómez, Ana')
    expect(movido).toMatchObject({ status: 'CANCELLED', whatsappUrl: null })
    expect(movido?.failureReason).toContain('reprogramó')
    const nuevoDia = new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(new Date(turno.startsAt.getTime() + dosDias))
    const nuevo = (await as(app, recepcion).post('/api/reminders/generate', { date: nuevoDia }).expect(200)).body as Dia
    expect(nuevo.reminders.map((r) => r.status)).toEqual(['PENDING'])
  })
})

describe('telefono vigente y whatsapp', () => {
  const generar = async () => ((await as(app, recepcion).post('/api/reminders/generate', {}).expect(200)).body as Dia).reminders
  const paciente = (nombre: string) => db.patient.findFirstOrThrow({ where: { firstName: nombre } })

  it('si se corrige el telefono antes de enviar, el recordatorio usa el numero nuevo', async () => {
    await generar()
    const ana = await paciente('Ana')
    const beto = await paciente('Beto')
    await as(app, recepcion).patch(`/api/patients/${ana.id}`, { phone: '11 6666-0000' }).expect(200)
    await as(app, recepcion).patch(`/api/patients/${beto.id}`, { phone: '11 7777-0000' }).expect(200)
    const [primero, segundo] = ((await as(app, recepcion).get(`/api/reminders?date=${manana}`).expect(200)).body as Dia).reminders
    expect(primero?.whatsappUrl).toMatch(/^https:\/\/wa\.me\/5491166660000/)
    expect(segundo?.status).toBe('PENDING')
    expect(segundo?.whatsappUrl).toMatch(/5491177770000/)

    await as(app, recepcion).post(`/api/reminders/${primero?.id}/sent`).expect(200)
    await as(app, recepcion).patch(`/api/patients/${ana.id}`, { phone: '11 8888-0000' }).expect(200)
    const enviado = await db.reminder.findUniqueOrThrow({ where: { id: primero?.id ?? '' } })
    expect(enviado.phone).toBe('11 6666-0000')
  })

  it('sin whatsapp no ofrece el link pero se puede marcar como avisado', async () => {
    const ana = await paciente('Ana')
    await as(app, recepcion).patch(`/api/patients/${ana.id}`, { phoneHasWhatsapp: false }).expect(200)
    const [primero] = await generar()
    expect([primero?.status, primero?.whatsappUrl]).toEqual(['PENDING', null])
    expect(primero?.failureReason).toContain('llamada')
    await as(app, recepcion).post(`/api/reminders/${primero?.id}/sent`).expect(200)
  })
})
