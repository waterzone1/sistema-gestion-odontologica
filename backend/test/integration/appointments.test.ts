import request from 'supertest'
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
let admin: Client
let recepcion: Client
let odontologa: Client
let odontologo: Client
let paciente: { id: string }
let perfilA: string
let perfilB: string
let adminId: string

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const iso = (fecha: Date) => fecha.toISOString()
const dia = (horas: number) => new Date(Date.UTC(2030, 5, 10, horas, 0, 0))
const mas = (fecha: Date, minutos: number) => new Date(fecha.getTime() + minutos * 60_000)

function turno(extra: Record<string, unknown> = {}) {
  return {
    patientId: paciente.id,
    professionalId: perfilA,
    branchId: seed.branchId,
    startsAt: iso(dia(13)),
    endsAt: iso(dia(14)),
    ...extra,
  }
}

const ids = (res: request.Response) => (res.body as { id: string }[]).map((t) => t.id)
const rangoDia = `from=${encodeURIComponent(iso(dia(0)))}&to=${encodeURIComponent(iso(dia(23)))}`

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  adminId = (await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })).id
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  const a = await seedProfessional(db, seed, { username: 'odontologa', displayName: 'Dra. Ruiz', branchIds: [seed.branchId, seed.secondBranchId] })
  const b = await seedProfessional(db, seed, { username: 'odontologo', displayName: 'Dr. Paz' })
  perfilA = a.profile.id
  perfilB = b.profile.id
  paciente = await seedPatient(db, seed, { firstName: 'Ana', lastName: 'Gómez' })
  admin = await loginAs(app, 'admin')
  recepcion = await loginAs(app, 'recepcion')
  odontologa = await loginAs(app, 'odontologa')
  odontologo = await loginAs(app, 'odontologo')
})

describe('alta de turnos', () => {
  it('recepcion crea un turno pendiente con todos sus datos', async () => {
    const practica = await seedPractice(db, seed, { code: 'CON', name: 'Consulta' })
    const res = await as(app, recepcion).post('/api/appointments', turno({ practiceId: practica.id, notes: 'Primera vez' }))
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      status: 'SCHEDULED',
      notes: 'Primera vez',
      patient: { id: paciente.id, fullName: 'Gómez, Ana' },
      professional: { id: perfilA, displayName: 'Dra. Ruiz' },
      practice: { code: 'CON', name: 'Consulta' },
      branch: { id: seed.branchId },
    })
    expect(await db.auditLog.count({ where: { action: 'APPOINTMENT_CREATED' } })).toBe(1)
  })

  it('el odontologo no puede crear turnos', async () => {
    const res = await as(app, odontologa).post('/api/appointments', turno())
    expect(res.status).toBe(403)
    expect(await db.appointment.count()).toBe(0)
  })

  it('rechaza rangos invalidos', async () => {
    const invertido = await as(app, recepcion).post('/api/appointments', turno({ startsAt: iso(dia(14)), endsAt: iso(dia(13)) }))
    expect(invertido.status).toBe(422)
    expect(codigo(invertido)).toBe('INVALID_TIME_RANGE')
    const largo = await as(app, recepcion).post('/api/appointments', turno({ startsAt: iso(dia(8)), endsAt: iso(dia(20)) }))
    expect(codigo(largo)).toBe('INVALID_TIME_RANGE')
    expect((await as(app, recepcion).post('/api/appointments', turno({ startsAt: 'manana' }))).status).toBe(400)
    expect((await as(app, recepcion).post('/api/appointments', {})).status).toBe(400)
  })

  it('rechaza referencias invalidas', async () => {
    const archivado = await seedPatient(db, seed, { archived: true })
    const r1 = await as(app, recepcion).post('/api/appointments', turno({ patientId: archivado.id }))
    expect(codigo(r1)).toBe('PATIENT_ARCHIVED')
    const r2 = await as(app, recepcion).post('/api/appointments', turno({ patientId: '00000000-0000-7000-8000-000000000000' }))
    expect(r2.status).toBe(404)
    const r3 = await as(app, recepcion).post('/api/appointments', turno({ professionalId: '00000000-0000-7000-8000-000000000000' }))
    expect(codigo(r3)).toBe('INVALID_PROFESSIONAL')
    const inactiva = await seedPractice(db, seed, { active: false })
    const r4 = await as(app, recepcion).post('/api/appointments', turno({ practiceId: inactiva.id }))
    expect(codigo(r4)).toBe('INVALID_PRACTICE')
    await db.branch.update({ where: { id: seed.secondBranchId }, data: { active: false } })
    const r5 = await as(app, admin).post('/api/appointments', turno({ branchId: seed.secondBranchId }))
    expect(codigo(r5)).toBe('INVALID_BRANCH')
  })

  it('el profesional tiene que atender en la sede elegida', async () => {
    const res = await as(app, admin).post('/api/appointments', turno({ professionalId: perfilB, branchId: seed.secondBranchId }))
    expect(res.status).toBe(422)
    expect(codigo(res)).toBe('PROFESSIONAL_NOT_IN_BRANCH')
  })

  it('recepcion solo opera en sus sedes; el admin en todas', async () => {
    const res = await as(app, recepcion).post('/api/appointments', turno({ branchId: seed.secondBranchId }))
    expect(res.status).toBe(403)
    expect(codigo(res)).toBe('FORBIDDEN_BRANCH')
    const admitido = await as(app, admin).post('/api/appointments', turno({ branchId: seed.secondBranchId }))
    expect(admitido.status).toBe(201)
  })
})

describe('superposicion de turnos', () => {
  it('no permite dos turnos que se pisen para el mismo profesional', async () => {
    const primero = await as(app, recepcion).post('/api/appointments', turno())
    const pisado = await as(app, recepcion).post(
      '/api/appointments',
      turno({ startsAt: iso(mas(dia(13), 30)), endsAt: iso(mas(dia(14), 30)) }),
    )
    expect(pisado.status).toBe(409)
    expect(codigo(pisado)).toBe('APPOINTMENT_CONFLICT')
    expect((pisado.body as { error: { details: { appointmentId: string } } }).error.details.appointmentId).toBe(
      (primero.body as { id: string }).id,
    )
    expect(await db.appointment.count()).toBe(1)
  })

  it('permite turnos consecutivos y de distintos profesionales', async () => {
    await as(app, recepcion).post('/api/appointments', turno()).expect(201)
    await as(app, recepcion).post('/api/appointments', turno({ startsAt: iso(dia(14)), endsAt: iso(dia(15)) })).expect(201)
    await as(app, recepcion).post('/api/appointments', turno({ professionalId: perfilB })).expect(201)
  })

  it('un profesional no puede estar en dos sedes a la vez', async () => {
    await as(app, admin).post('/api/appointments', turno()).expect(201)
    const res = await as(app, admin).post('/api/appointments', turno({ branchId: seed.secondBranchId }))
    expect(res.status).toBe(409)
  })

  it('con dos pedidos simultaneos al mismo horario solo uno se crea', async () => {
    const enviar = () => as(app, recepcion).post('/api/appointments', turno())
    const [a, b] = await Promise.all([enviar(), enviar()])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    expect(await db.appointment.count()).toBe(1)
  })

  it('cancelar libera el horario y conserva el turno', async () => {
    const creado = await as(app, recepcion).post('/api/appointments', turno())
    const id = (creado.body as { id: string }).id
    await as(app, recepcion).post(`/api/appointments/${id}/status`, { status: 'CANCELLED', cancellationReason: 'Paciente viaja' }).expect(200)
    await as(app, recepcion).post('/api/appointments', turno()).expect(201)
    expect(await db.appointment.count()).toBe(2)
    expect(await db.appointment.count({ where: { status: 'CANCELLED' } })).toBe(1)
  })

  it('la base de datos impone la regla aunque se salte la aplicacion', async () => {
    await seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilA, createdById: adminId, startsAt: dia(13), endsAt: dia(14) })
    await expect(
      seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilA, createdById: adminId, startsAt: mas(dia(13), 30), endsAt: dia(15) }),
    ).rejects.toThrow()
    await expect(
      seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilB, createdById: adminId, startsAt: dia(15), endsAt: dia(14) }),
    ).rejects.toThrow()
  })
})

describe('listado y visibilidad', () => {
  it('filtra por rango, profesional, estado y paciente', async () => {
    const otro = await seedPatient(db, seed)
    const t1 = await seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilA, createdById: adminId, startsAt: dia(9), endsAt: dia(10) })
    const t2 = await seedAppointment(db, seed, { patientId: otro.id, professionalId: perfilB, createdById: adminId, startsAt: dia(11), endsAt: dia(12), status: 'CONFIRMED' })
    await seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilA, createdById: adminId, startsAt: mas(dia(9), 3 * 1440), endsAt: mas(dia(10), 3 * 1440) })

    expect(ids(await as(app, recepcion).get(`/api/appointments?${rangoDia}`))).toEqual([t1.id, t2.id])
    expect(ids(await as(app, recepcion).get(`/api/appointments?${rangoDia}&professionalId=${perfilB}`))).toEqual([t2.id])
    expect(ids(await as(app, recepcion).get(`/api/appointments?${rangoDia}&status=CONFIRMED`))).toEqual([t2.id])
    expect(ids(await as(app, recepcion).get(`/api/appointments?${rangoDia}&patientId=${paciente.id}`))).toEqual([t1.id])
  })

  it('valida el rango consultado', async () => {
    const invertido = `from=${encodeURIComponent(iso(dia(5)))}&to=${encodeURIComponent(iso(dia(1)))}`
    expect((await as(app, recepcion).get(`/api/appointments?${invertido}`)).status).toBe(400)
    const enorme = `from=${encodeURIComponent('2030-01-01T00:00:00Z')}&to=${encodeURIComponent('2030-12-31T00:00:00Z')}`
    expect((await as(app, recepcion).get(`/api/appointments?${enorme}`)).status).toBe(400)
    const anual = `from=${encodeURIComponent('2030-01-01T00:00:00Z')}&to=${encodeURIComponent('2030-12-01T00:00:00Z')}`
    expect((await as(app, recepcion).get(`/api/appointments?${anual}&patientId=${paciente.id}`)).status).toBe(200)
    expect((await as(app, recepcion).get('/api/appointments')).status).toBe(400)
  })

  it('recepcion ve solo las sedes donde trabaja; el admin todas', async () => {
    const enA = await seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilA, createdById: adminId, startsAt: dia(9), endsAt: dia(10) })
    const enB = await seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilA, createdById: adminId, startsAt: dia(11), endsAt: dia(12), branchId: seed.secondBranchId })
    expect(ids(await as(app, recepcion).get(`/api/appointments?${rangoDia}`))).toEqual([enA.id])
    expect(ids(await as(app, admin).get(`/api/appointments?${rangoDia}`))).toEqual([enA.id, enB.id])
    expect((await as(app, recepcion).get(`/api/appointments/${enB.id}`)).status).toBe(404)
  })

  it('el odontologo ve solo sus turnos', async () => {
    const suyo = await seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilA, createdById: adminId, startsAt: dia(9), endsAt: dia(10) })
    const ajeno = await seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilB, createdById: adminId, startsAt: dia(9), endsAt: dia(10) })
    expect(ids(await as(app, odontologa).get(`/api/appointments?${rangoDia}`))).toEqual([suyo.id])
    expect((await as(app, odontologa).get(`/api/appointments/${suyo.id}`)).status).toBe(200)
    expect((await as(app, odontologa).get(`/api/appointments/${ajeno.id}`)).status).toBe(404)
  })
})

describe('reprogramacion y edicion', () => {
  it('reprograma un turno, lo audita y detecta choques', async () => {
    const t1 = await as(app, recepcion).post('/api/appointments', turno())
    const t2 = await as(app, recepcion).post('/api/appointments', turno({ startsAt: iso(dia(15)), endsAt: iso(dia(16)) }))
    const id1 = (t1.body as { id: string }).id

    const choque = await as(app, recepcion).patch(`/api/appointments/${id1}`, { startsAt: iso(dia(15)), endsAt: iso(dia(16)) })
    expect(choque.status).toBe(409)
    expect((choque.body as { error: { details: { appointmentId: string } } }).error.details.appointmentId).toBe(
      (t2.body as { id: string }).id,
    )

    const ok = await as(app, recepcion).patch(`/api/appointments/${id1}`, { startsAt: iso(dia(17)), endsAt: iso(dia(18)) })
    expect(ok.status).toBe(200)
    expect((ok.body as { startsAt: string }).startsAt).toBe(iso(dia(17)))
    const evento = await db.auditLog.findFirstOrThrow({ where: { action: 'APPOINTMENT_UPDATED' } })
    expect(evento.metadata).toMatchObject({ reprogramado: true })
  })

  it('un turno puede solaparse consigo mismo al moverlo un poco', async () => {
    const creado = await as(app, recepcion).post('/api/appointments', turno())
    const id = (creado.body as { id: string }).id
    const res = await as(app, recepcion).patch(`/api/appointments/${id}`, {
      startsAt: iso(mas(dia(13), 15)),
      endsAt: iso(mas(dia(14), 15)),
    })
    expect(res.status).toBe(200)
  })

  it('cambiar solo las notas no reprograma; reprogramar uno confirmado lo deja pendiente', async () => {
    const creado = await as(app, recepcion).post('/api/appointments', turno())
    const id = (creado.body as { id: string }).id
    await as(app, recepcion).post(`/api/appointments/${id}/status`, { status: 'CONFIRMED' }).expect(200)

    const notas = await as(app, recepcion).patch(`/api/appointments/${id}`, { notes: 'Trae estudios' })
    expect(notas.body).toMatchObject({ status: 'CONFIRMED', notes: 'Trae estudios' })

    const mover = await as(app, recepcion).patch(`/api/appointments/${id}`, { startsAt: iso(dia(16)), endsAt: iso(dia(17)) })
    expect(mover.body).toMatchObject({ status: 'SCHEDULED' })
  })

  it('solo se editan turnos pendientes o confirmados', async () => {
    const atendido = await seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilA, createdById: adminId, startsAt: dia(9), endsAt: dia(10), status: 'ATTENDED' })
    const res = await as(app, recepcion).patch(`/api/appointments/${atendido.id}`, { notes: 'x' })
    expect(res.status).toBe(409)
    expect(codigo(res)).toBe('NOT_EDITABLE')
  })

  it('el odontologo no puede editar turnos y la edicion vacia se rechaza', async () => {
    const creado = await as(app, recepcion).post('/api/appointments', turno())
    const id = (creado.body as { id: string }).id
    expect((await as(app, odontologa).patch(`/api/appointments/${id}`, { notes: 'x' })).status).toBe(403)
    expect((await as(app, recepcion).patch(`/api/appointments/${id}`, {})).status).toBe(400)
  })

  it('no hay forma de borrar un turno', async () => {
    const creado = await as(app, recepcion).post('/api/appointments', turno())
    const id = (creado.body as { id: string }).id
    const res = await request(app)
      .delete(`/api/appointments/${id}`)
      .set('Cookie', admin.cookie)
      .set('Origin', 'https://test.local')
      .set('X-CSRF-Token', admin.csrfToken)
    expect(res.status).toBe(404)
    expect(await db.appointment.count()).toBe(1)
  })
})

describe('estados del turno', () => {
  it('recepcion confirma; confirmar dos veces no se puede', async () => {
    const creado = await as(app, recepcion).post('/api/appointments', turno())
    const id = (creado.body as { id: string }).id
    const ok = await as(app, recepcion).post(`/api/appointments/${id}/status`, { status: 'CONFIRMED' })
    expect(ok.body).toMatchObject({ status: 'CONFIRMED' })
    const otra = await as(app, recepcion).post(`/api/appointments/${id}/status`, { status: 'CONFIRMED' })
    expect(otra.status).toBe(409)
    expect(codigo(otra)).toBe('INVALID_TRANSITION')
    const evento = await db.auditLog.findFirstOrThrow({ where: { action: 'APPOINTMENT_STATUS_CHANGED' } })
    expect(evento.metadata).toMatchObject({ desde: 'SCHEDULED', hacia: 'CONFIRMED' })
  })

  it('cancelar exige motivo, lo guarda y deja el turno en el historial', async () => {
    const creado = await as(app, recepcion).post('/api/appointments', turno())
    const id = (creado.body as { id: string }).id
    expect((await as(app, recepcion).post(`/api/appointments/${id}/status`, { status: 'CANCELLED' })).status).toBe(400)
    const ok = await as(app, recepcion).post(`/api/appointments/${id}/status`, { status: 'CANCELLED', cancellationReason: 'Paciente viaja' })
    expect(ok.body).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Paciente viaja' })
    const final = await as(app, recepcion).post(`/api/appointments/${id}/status`, { status: 'CONFIRMED' })
    expect(final.status).toBe(409)
  })

  it('el odontologo no puede confirmar ni cancelar', async () => {
    const t = await seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilA, createdById: adminId, startsAt: dia(9), endsAt: dia(10) })
    expect((await as(app, odontologa).post(`/api/appointments/${t.id}/status`, { status: 'CONFIRMED' })).status).toBe(403)
    expect((await as(app, odontologa).post(`/api/appointments/${t.id}/status`, { status: 'CANCELLED', cancellationReason: 'xxx' })).status).toBe(403)
  })

  it('el odontologo marca atendido su turno una vez llegada la hora', async () => {
    const pasado = await seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilA, createdById: adminId, startsAt: minutesFromNow(-60), endsAt: minutesFromNow(-30) })
    const ok = await as(app, odontologa).post(`/api/appointments/${pasado.id}/status`, { status: 'ATTENDED' })
    expect(ok.body).toMatchObject({ status: 'ATTENDED' })
    const otra = await as(app, odontologa).post(`/api/appointments/${pasado.id}/status`, { status: 'CANCELLED', cancellationReason: 'xxx' })
    expect(otra.status).toBe(403)
  })

  it('se puede marcar atendido o ausente antes de la hora: la interfaz solo advierte', async () => {
    const futuro = await seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilA, createdById: adminId, startsAt: minutesFromNow(120), endsAt: minutesFromNow(150) })
    const res = await as(app, odontologa).post(`/api/appointments/${futuro.id}/status`, { status: 'ATTENDED' })
    expect(res.body).toMatchObject({ status: 'ATTENDED' })
    const otro = await seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilA, createdById: adminId, startsAt: minutesFromNow(200), endsAt: minutesFromNow(230) })
    expect((await as(app, recepcion).post(`/api/appointments/${otro.id}/status`, { status: 'NO_SHOW' })).status).toBe(200)
  })

  it('un odontologo no toca los turnos de otro', async () => {
    const ajeno = await seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilB, createdById: adminId, startsAt: minutesFromNow(-60), endsAt: minutesFromNow(-30) })
    expect((await as(app, odontologa).post(`/api/appointments/${ajeno.id}/status`, { status: 'ATTENDED' })).status).toBe(404)
    expect((await as(app, odontologo).post(`/api/appointments/${ajeno.id}/status`, { status: 'ATTENDED' })).status).toBe(200)
  })

  it('atendido y ausente son estados finales', async () => {
    const t = await seedAppointment(db, seed, { patientId: paciente.id, professionalId: perfilA, createdById: adminId, startsAt: minutesFromNow(-60), endsAt: minutesFromNow(-30), status: 'NO_SHOW' })
    expect((await as(app, recepcion).post(`/api/appointments/${t.id}/status`, { status: 'ATTENDED' })).status).toBe(409)
  })
})

describe('auditoria', () => {
  it('no guarda nombres de pacientes ni motivos en la auditoria', async () => {
    const creado = await as(app, recepcion).post('/api/appointments', turno({ notes: 'Nota privada' }))
    const id = (creado.body as { id: string }).id
    await as(app, recepcion).post(`/api/appointments/${id}/status`, { status: 'CANCELLED', cancellationReason: 'Motivo privado' })
    const texto = JSON.stringify(await db.auditLog.findMany())
    for (const dato of ['Gómez', 'Nota privada', 'Motivo privado']) expect(texto).not.toContain(dato)
  })
})
