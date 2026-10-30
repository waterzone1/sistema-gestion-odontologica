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
} from '../helpers.js'

const db = testDb()
const app = buildApp(db)
let admin: Client
let recepcion: Client
let odontologo: Client
let pacienteId: string

interface Lista {
  items: { action: string; actor: { displayName: string } | null; metadata: Record<string, unknown> | null }[]
  total: number
}

beforeEach(async () => {
  await resetDb(db)
  const seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'], displayName: 'Marta Admin' })
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  await seedProfessional(db, seed, { username: 'odontologo', displayName: 'Dra. Paz' })
  pacienteId = (await seedPatient(db, seed)).id
  admin = await loginAs(app, 'admin')
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
})

describe('pantalla de auditoria', () => {
  it('administracion ve quien hizo que, filtra por accion y pagina', async () => {
    await as(app, odontologo).post(`/api/patients/${pacienteId}/clinical`, { content: 'Dolor en pieza 36' }).expect(201)
    const todo = (await as(app, admin).get('/api/audit?pageSize=2').expect(200)).body as Lista
    expect(todo.items).toHaveLength(2)
    expect(todo.total).toBeGreaterThanOrEqual(4)

    const clinica = (await as(app, admin).get('/api/audit?action=CLINICAL_ENTRY_CREATED').expect(200)).body as Lista
    expect(clinica.items).toHaveLength(1)
    expect(clinica.items[0]?.actor?.displayName).toBe('Dra. Paz')
    expect(JSON.stringify(clinica)).not.toContain('Dolor')

    const logins = (await as(app, admin).get('/api/audit?action=LOGIN_SUCCESS').expect(200)).body as Lista
    expect(logins.items.map((i) => i.actor?.displayName)).toContain('Marta Admin')
  })

  it('cada evento dice en palabras a quien afecta, sin mostrar contenido clinico', async () => {
    await as(app, odontologo).post(`/api/patients/${pacienteId}/clinical`, { content: 'Dolor en pieza 36' }).expect(201)
    await as(app, recepcion).patch(`/api/patients/${pacienteId}`, { phone: '11 4000-0000' }).expect(200)
    const lista = (await as(app, admin).get('/api/audit').expect(200)).body as { items: { action: string; subject: string | null }[] }
    const sujeto = (accion: string) => lista.items.find((item) => item.action === accion)?.subject
    const paciente = await db.patient.findUniqueOrThrow({ where: { id: pacienteId } })
    expect(sujeto('PATIENT_UPDATED')).toBe(`${paciente.lastName}, ${paciente.firstName}`)
    expect(sujeto('CLINICAL_ENTRY_CREATED')).toBe(`Historia clínica de ${paciente.lastName}, ${paciente.firstName}`)
    expect(JSON.stringify(lista)).not.toContain('Dolor en pieza 36')
  })

  it('recepcion y odontologos no acceden', async () => {
    expect((await as(app, recepcion).get('/api/audit')).status).toBe(403)
    expect((await as(app, odontologo).get('/api/audit')).status).toBe(403)
    expect((await as(app, admin).get('/api/audit?from=2026-05-02&to=2026-05-01')).status).toBe(400)
  })
})
