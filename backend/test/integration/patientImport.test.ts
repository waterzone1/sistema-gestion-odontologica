import type request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { as, buildApp, loginAs, resetDb, seedInstall, seedPatient, seedProfessional, seedUser, testDb, type Client } from '../helpers.js'

const db = testDb()
const app = buildApp(db)
let recepcion: Client
let odontologo: Client

const ENCABEZADO = 'nombre;apellido;tipo_documento;documento;fecha_nacimiento;telefono;email;direccion'
const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code

beforeEach(async () => {
  await resetDb(db)
  const seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  await seedProfessional(db, seed, { username: 'odontologo' })
  await seedPatient(db, seed, { documentNumber: '30111222' })
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
})

const csv = [
  ENCABEZADO,
  'Ana;Gómez;DNI;40.111.222;10/03/1985;11 5555-1234;ana@ejemplo.com;"Calle 1; piso 2"',
  'Beto;Ruiz;;40111333;1990-01-02;;;',
  'Sin;Fecha;DNI;40111444;;;;',
  'Repe;Tido;DNI;40111222;01/01/2000;;;',
  'Ya;Existe;DNI;30111222;01/01/2000;;;',
  'Mal;Mail;DNI;40111555;01/01/2000;;no-es-mail;',
].join('\n')

describe('importacion de pacientes', () => {
  it('la vista previa marca errores por fila sin importar nada', async () => {
    const res = await as(app, recepcion).post('/api/patient-imports/preview', { csv }).expect(200)
    const vista = res.body as { valid: number; invalid: number; rows: { line: number; errors: string[] }[] }
    expect([vista.valid, vista.invalid]).toEqual([2, 4])
    const errores = Object.fromEntries(vista.rows.map((row) => [row.line, row.errors.join(' | ')]))
    expect(errores[2]).toBe('')
    expect(errores[3]).toBe('')
    expect(errores[4]).toContain('fecha de nacimiento')
    expect(errores[5]).toContain('repetido en el archivo (fila 2)')
    expect(errores[6]).toContain('Ya existe un paciente')
    expect(errores[7]).toContain('Email inválido')
    expect(await db.patient.count()).toBe(1)
  })

  it('importa solo las filas validas y lo audita', async () => {
    const res = await as(app, recepcion).post('/api/patient-imports', { csv }).expect(201)
    expect(res.body).toEqual({ created: 2, skipped: 4 })
    const ana = await db.patient.findFirstOrThrow({ where: { documentNumber: '40111222' } })
    expect(ana).toMatchObject({ firstName: 'Ana', address: 'Calle 1; piso 2' })
    expect(ana.searchText).toContain('gomez')
    expect(await db.auditLog.count({ where: { action: 'PATIENTS_IMPORTED' } })).toBe(1)
  })

  it('rechaza un encabezado incompleto y el odontologo no importa', async () => {
    const malo = await as(app, recepcion).post('/api/patient-imports/preview', { csv: 'nombre;apellido\nAna;Gómez' })
    expect([malo.status, codigo(malo)]).toEqual([422, 'INVALID_IMPORT_HEADER'])
    expect((await as(app, odontologo).post('/api/patient-imports', { csv })).status).toBe(403)
    const plantilla = await as(app, recepcion).get('/api/patient-imports/template').expect(200)
    expect(plantilla.text).toContain(ENCABEZADO)
  })
})
