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
let odontologo: Client
let otro: Client
let pacienteId: string
let perfilId: string
let odontologoUserId: string

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const ruta = (id = pacienteId) => `/api/patients/${id}/clinical`

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  const profesional = await seedProfessional(db, seed, { username: 'odontologo', displayName: 'Dra. Paz' })
  await seedProfessional(db, seed, { username: 'otro', displayName: 'Dr. Gil' })
  perfilId = profesional.profile.id
  odontologoUserId = profesional.user.id
  pacienteId = (await seedPatient(db, seed)).id
  admin = await loginAs(app, 'admin')
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
  otro = await loginAs(app, 'otro')
})

describe('historia clinica: acceso', () => {
  it('administracion y recepcion reciben 403 aunque la nota exista', async () => {
    await as(app, odontologo).post(ruta(), { content: 'Caries en 16' }).expect(201)
    for (const cliente of [admin, recepcion]) {
      const lectura = await as(app, cliente).get(ruta())
      expect(lectura.status).toBe(403)
      expect(JSON.stringify(lectura.body)).not.toContain('Caries')
      expect((await as(app, cliente).post(ruta(), { content: 'Intento' })).status).toBe(403)
    }
    expect(await db.clinicalEntry.count()).toBe(1)
  })

  it('el odontologo lee la historia y cada apertura queda auditada sin contenido', async () => {
    await as(app, odontologo).post(ruta(), { content: 'Control de rutina' }).expect(201)
    const res = await as(app, odontologo).get(ruta())
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    const auditoria = await db.auditLog.findMany({ where: { action: 'CLINICAL_HISTORY_VIEWED' } })
    expect(auditoria).toHaveLength(1)
    expect(auditoria[0]).toMatchObject({ entityId: pacienteId, actorUserId: odontologoUserId })
    expect(JSON.stringify(auditoria)).not.toContain('Control de rutina')
  })

  it('un paciente inexistente da 404', async () => {
    const res = await as(app, odontologo).get(ruta('00000000-0000-7000-8000-000000000000'))
    expect(res.status).toBe(404)
  })
})

describe('historia clinica: notas', () => {
  it('registra una evolucion a nombre del profesional y la lista de la mas reciente a la mas antigua', async () => {
    const primera = await as(app, odontologo).post(ruta(), { content: '  Primera consulta  ' })
    expect(primera.status).toBe(201)
    expect(primera.body).toMatchObject({
      entryType: 'EVOLUTION',
      content: 'Primera consulta',
      correctionOfId: null,
      professional: { id: perfilId, displayName: 'Dra. Paz' },
    })
    await as(app, otro).post(ruta(), { content: 'Segunda consulta' }).expect(201)
    const lista = (await as(app, odontologo).get(ruta())).body as { content: string }[]
    expect(lista.map((n) => n.content)).toEqual(['Segunda consulta', 'Primera consulta'])
  })

  it('valida el contenido', async () => {
    expect((await as(app, odontologo).post(ruta(), { content: '  ' })).status).toBe(400)
    expect((await as(app, odontologo).post(ruta(), { content: 'x'.repeat(10001) })).status).toBe(400)
  })

  it('vincula la nota a un turno propio del paciente', async () => {
    const turno = await seedAppointment(db, seed, {
      patientId: pacienteId,
      professionalId: perfilId,
      createdById: odontologoUserId,
      startsAt: minutesFromNow(-60),
      endsAt: minutesFromNow(-30),
    })
    const res = await as(app, odontologo).post(ruta(), { content: 'Atendido', appointmentId: turno.id })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ appointmentId: turno.id })
    const vistaClinica = await as(app, odontologo).get(`/api/appointments/${turno.id}`)
    expect(vistaClinica.body).toMatchObject({ hasClinicalNote: true })
    const vistaRecepcion = await as(app, recepcion).get(`/api/appointments/${turno.id}`)
    expect(vistaRecepcion.body).toMatchObject({ hasClinicalNote: null })
  })

  it('rechaza un turno de otro profesional o de otro paciente', async () => {
    const ajeno = await db.professionalProfile.findFirstOrThrow({ where: { NOT: { id: perfilId } } })
    const deOtro = await seedAppointment(db, seed, {
      patientId: pacienteId,
      professionalId: ajeno.id,
      createdById: odontologoUserId,
      startsAt: minutesFromNow(60),
      endsAt: minutesFromNow(90),
    })
    const otroPaciente = await seedPatient(db, seed)
    const deOtroPaciente = await seedAppointment(db, seed, {
      patientId: otroPaciente.id,
      professionalId: perfilId,
      createdById: odontologoUserId,
      startsAt: minutesFromNow(120),
      endsAt: minutesFromNow(150),
    })
    for (const turno of [deOtro, deOtroPaciente]) {
      const res = await as(app, odontologo).post(ruta(), { content: 'Nota', appointmentId: turno.id })
      expect(res.status).toBe(422)
      expect(codigo(res)).toBe('INVALID_APPOINTMENT')
    }
  })

  it('no permite registrar notas a un paciente archivado, pero si leerlas', async () => {
    await as(app, odontologo).post(ruta(), { content: 'Previa' }).expect(201)
    await db.patient.update({ where: { id: pacienteId }, data: { archivedAt: new Date() } })
    const res = await as(app, odontologo).post(ruta(), { content: 'Nueva' })
    expect(res.status).toBe(422)
    expect(codigo(res)).toBe('PATIENT_ARCHIVED')
    expect((await as(app, odontologo).get(ruta())).status).toBe(200)
  })

  it('un odontologo sin perfil profesional no puede registrar notas', async () => {
    await seedUser(db, seed, { username: 'sinperfil', roles: ['DENTIST'] })
    const sinPerfil = await loginAs(app, 'sinperfil')
    const res = await as(app, sinPerfil).post(ruta(), { content: 'Nota' })
    expect(res.status).toBe(422)
    expect(codigo(res)).toBe('PROFESSIONAL_PROFILE_REQUIRED')
  })

  it('audita la creacion sin guardar el contenido', async () => {
    const nota = await as(app, odontologo).post(ruta(), { content: 'Dato sensible del paciente' })
    const auditoria = await db.auditLog.findMany({ where: { action: 'CLINICAL_ENTRY_CREATED' } })
    expect(auditoria).toHaveLength(1)
    expect(auditoria[0]).toMatchObject({ entityId: (nota.body as { id: string }).id })
    expect(JSON.stringify(auditoria)).not.toContain('Dato sensible')
  })
})

describe('historia clinica: correcciones', () => {
  it('corrige con una adenda y conserva la nota original', async () => {
    const original = (await as(app, odontologo).post(ruta(), { content: 'Caries en 16' })).body as { id: string }
    const adenda = await as(app, otro).post(`${ruta()}/${original.id}/corrections`, { content: 'Era la pieza 26' })
    expect(adenda.status).toBe(201)
    expect(adenda.body).toMatchObject({
      entryType: 'CORRECTION',
      correctionOfId: original.id,
      professional: { displayName: 'Dr. Gil' },
    })
    const lista = (await as(app, odontologo).get(ruta())).body as { id: string; content: string }[]
    expect(lista).toHaveLength(2)
    expect(lista.find((n) => n.id === original.id)?.content).toBe('Caries en 16')
    expect(await db.auditLog.count({ where: { action: 'CLINICAL_ENTRY_CORRECTED' } })).toBe(1)
  })

  it('no se corrige una correccion ni una nota de otro paciente', async () => {
    const original = (await as(app, odontologo).post(ruta(), { content: 'Nota original' })).body as { id: string }
    const adenda = (await as(app, odontologo).post(`${ruta()}/${original.id}/corrections`, { content: 'Adenda' }))
      .body as { id: string }
    const sobreAdenda = await as(app, odontologo).post(`${ruta()}/${adenda.id}/corrections`, { content: 'Otra' })
    expect(sobreAdenda.status).toBe(422)
    expect(codigo(sobreAdenda)).toBe('CANNOT_CORRECT_CORRECTION')

    const otroPaciente = await seedPatient(db, seed)
    const cruzada = await as(app, odontologo).post(`${ruta(otroPaciente.id)}/${original.id}/corrections`, {
      content: 'Cruzada',
    })
    expect(cruzada.status).toBe(404)
  })
})

describe('historia clinica: inmutabilidad en la base', () => {
  it('la base rechaza modificar o borrar una nota', async () => {
    const nota = (await as(app, odontologo).post(ruta(), { content: 'Inmutable' })).body as { id: string }
    await expect(
      db.clinicalEntry.update({ where: { id: nota.id }, data: { content: 'Alterada' } }),
    ).rejects.toThrow()
    await expect(db.clinicalEntry.delete({ where: { id: nota.id } })).rejects.toThrow()
    const guardada = await db.clinicalEntry.findUniqueOrThrow({ where: { id: nota.id } })
    expect(guardada.content).toBe('Inmutable')
  })
})
