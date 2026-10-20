import type request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  as,
  buildApp,
  loginAs,
  resetDb,
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
let recepcion: Client
let odontologo: Client
let pacienteId: string

const ruta = (id = pacienteId) => `/api/patients/${id}/notes`
const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const contenidos = (res: request.Response) => (res.body as { content: string }[]).map((n) => n.content)

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'], displayName: 'Rocío' })
  await seedProfessional(db, seed, { username: 'odontologo', displayName: 'Dra. Paz' })
  pacienteId = (await seedPatient(db, seed)).id
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
})

describe('mensajes sobre el paciente', () => {
  it('recepcion escribe, el odontologo lo ve y responde, con autor y fecha', async () => {
    await as(app, recepcion).post(ruta(), { content: 'Viene con el hijo, avisar si se demora' }).expect(201)
    await as(app, odontologo).post(ruta(), { content: 'Ok, lo atiendo primero' }).expect(201)

    const lista = await as(app, recepcion).get(ruta()).expect(200)
    expect(contenidos(lista)).toEqual(['Ok, lo atiendo primero', 'Viene con el hijo, avisar si se demora'])
    const [respuesta] = lista.body as { author: { displayName: string }; createdAt: string }[]
    expect(respuesta?.author.displayName).toBe('Dra. Paz')
    expect(respuesta?.createdAt).toBeTruthy()

    expect(contenidos(await as(app, odontologo).get(ruta()).expect(200))).toHaveLength(2)
  })

  it('rechaza mensajes vacios o demasiado largos', async () => {
    await as(app, recepcion).post(ruta(), { content: '   ' }).expect(400)
    await as(app, recepcion).post(ruta(), { content: 'x'.repeat(1001) }).expect(400)
    expect(await db.patientNote.count()).toBe(0)
  })

  it('archivar lo saca de la lista sin borrarlo', async () => {
    const id = ((await as(app, recepcion).post(ruta(), { content: 'Debe la seña' }).expect(201)).body as { id: string }).id
    const archivado = await as(app, odontologo).post(`${ruta()}/${id}/archive`).expect(200)
    expect((archivado.body as { archivedAt: string | null }).archivedAt).not.toBeNull()

    expect(contenidos(await as(app, recepcion).get(ruta()).expect(200))).toEqual([])
    expect(contenidos(await as(app, recepcion).get(`${ruta()}?archived=true`).expect(200))).toEqual(['Debe la seña'])
    expect(await db.auditLog.count({ where: { action: 'PATIENT_NOTE_ARCHIVED', entityId: id } })).toBe(1)
  })

  it('no deja escribir en un paciente archivado', async () => {
    const archivado = await seedPatient(db, seed, { documentNumber: '20111222', archived: true })
    const res = await as(app, recepcion).post(ruta(archivado.id), { content: 'Hola' })
    expect(res.status).toBe(422)
    expect(codigo(res)).toBe('PATIENT_ARCHIVED')
  })

  it('la base no deja editar ni borrar un mensaje', async () => {
    const id = ((await as(app, recepcion).post(ruta(), { content: 'Original' }).expect(201)).body as { id: string }).id
    await expect(db.patientNote.update({ where: { id }, data: { content: 'Cambiado' } })).rejects.toThrow()
    await expect(db.patientNote.delete({ where: { id } })).rejects.toThrow()
    expect((await db.patientNote.findUniqueOrThrow({ where: { id } })).content).toBe('Original')
  })
})
