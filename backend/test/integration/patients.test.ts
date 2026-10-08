import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  as,
  buildApp,
  loginAs,
  resetDb,
  seedInstall,
  seedPatient,
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

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const ids = (res: request.Response) => (res.body as { items: { id: string }[] }).items.map((p) => p.id)
const apellidos = (res: request.Response) =>
  (res.body as { items: { lastName: string }[] }).items.map((p) => p.lastName)

const nuevoPaciente = (extra: Record<string, unknown> = {}) => ({
  firstName: 'Ana',
  lastName: 'Gómez',
  documentNumber: '30.123.456',
  birthDate: '1985-03-10',
  phone: '11 5555-1234',
  email: 'ana@example.com',
  address: 'Av. Corrientes 1234',
  ...extra,
})

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  await seedUser(db, seed, { username: 'odontologo', roles: ['DENTIST'] })
  admin = await loginAs(app, 'admin')
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
})

describe('alta de pacientes', () => {
  it('recepcion y admin pueden crear; el documento se normaliza', async () => {
    const res = await as(app, recepcion).post('/api/patients', nuevoPaciente())
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      firstName: 'Ana',
      lastName: 'Gómez',
      documentType: 'DNI',
      documentNumber: '30123456',
      birthDate: '1985-03-10',
      archivedAt: null,
    })
    const otro = await as(app, admin).post('/api/patients', nuevoPaciente({ documentNumber: '28999888' }))
    expect(otro.status).toBe(201)
  })

  it('el odontologo no puede dar de alta pacientes', async () => {
    const res = await as(app, odontologo).post('/api/patients', nuevoPaciente())
    expect(res.status).toBe(403)
    expect(await db.patient.count()).toBe(0)
  })

  it('el documento es opcional y varios pacientes pueden no tenerlo', async () => {
    await as(app, recepcion).post('/api/patients', nuevoPaciente({ documentNumber: null })).expect(201)
    await as(app, recepcion)
      .post('/api/patients', nuevoPaciente({ firstName: 'Beto', documentNumber: '' }))
      .expect(201)
  })

  it('rechaza un documento duplicado e indica de quien es', async () => {
    const primero = await as(app, recepcion).post('/api/patients', nuevoPaciente())
    const res = await as(app, recepcion).post('/api/patients', nuevoPaciente({ firstName: 'Otra' }))
    expect(res.status).toBe(409)
    expect(codigo(res)).toBe('DUPLICATE_PATIENT')
    expect((res.body as { error: { details: object } }).error.details).toMatchObject({
      patientId: (primero.body as { id: string }).id,
      archived: false,
    })
  })

  it('el mismo numero con otro tipo de documento no es duplicado', async () => {
    await as(app, recepcion).post('/api/patients', nuevoPaciente()).expect(201)
    await as(app, recepcion)
      .post('/api/patients', nuevoPaciente({ documentType: 'LE', documentNumber: '30123456' }))
      .expect(201)
  })

  it('avisa si el documento duplicado pertenece a un paciente archivado', async () => {
    await seedPatient(db, seed, { documentNumber: '30123456', archived: true })
    const res = await as(app, recepcion).post('/api/patients', nuevoPaciente())
    expect(res.status).toBe(409)
    expect((res.body as { error: { details: { archived: boolean } } }).error.details.archived).toBe(true)
  })

  it('valida el formato del documento segun el tipo', async () => {
    const dni = await as(app, recepcion).post('/api/patients', nuevoPaciente({ documentNumber: '12' }))
    expect(dni.status).toBe(422)
    expect(codigo(dni)).toBe('INVALID_DOCUMENT')
    await as(app, recepcion)
      .post('/api/patients', nuevoPaciente({ documentType: 'PASAPORTE', documentNumber: 'AAB123456' }))
      .expect(201)
  })

  it('valida los campos obligatorios y los formatos', async () => {
    expect((await as(app, recepcion).post('/api/patients', {})).status).toBe(400)
    expect((await as(app, recepcion).post('/api/patients', nuevoPaciente({ email: 'no-es-email' }))).status).toBe(400)
    expect((await as(app, recepcion).post('/api/patients', nuevoPaciente({ phone: 'abc' }))).status).toBe(400)
    expect((await as(app, recepcion).post('/api/patients', nuevoPaciente({ birthDate: '2999-01-01' }))).status).toBe(400)
    expect((await as(app, recepcion).post('/api/patients', nuevoPaciente({ birthDate: '10/03/1985' }))).status).toBe(400)
  })

  it('no hay forma de borrar un paciente', async () => {
    const creado = await as(app, recepcion).post('/api/patients', nuevoPaciente())
    const id = (creado.body as { id: string }).id
    const res = await as(app, admin).get(`/api/patients/${id}`)
    expect(res.status).toBe(200)
    const borrar = await request(app)
      .delete(`/api/patients/${id}`)
      .set('Cookie', admin.cookie)
      .set('Origin', 'https://test.local')
      .set('X-CSRF-Token', admin.csrfToken)
    expect(borrar.status).toBe(404)
    expect(await db.patient.count()).toBe(1)
  })
})

describe('busqueda y listado', () => {
  beforeEach(async () => {
    await seedPatient(db, seed, { firstName: 'Ana', lastName: 'Gómez', documentNumber: '30123456', phone: '11 5555-1234' })
    await seedPatient(db, seed, { firstName: 'María José', lastName: 'Pérez', documentNumber: '28111222', phone: '351 444-9999' })
    await seedPatient(db, seed, { firstName: 'Luis', lastName: 'Gómez Díaz', documentNumber: '40555666', phone: null })
    await seedPatient(db, seed, { firstName: 'Archivada', lastName: 'Zeta', documentNumber: '10000001', archived: true })
  })

  it('lista ordenado por apellido y sin archivados', async () => {
    const res = await as(app, recepcion).get('/api/patients')
    expect(res.status).toBe(200)
    expect(apellidos(res)).toEqual(['Gómez', 'Gómez Díaz', 'Pérez'])
    expect((res.body as { total: number }).total).toBe(3)
  })

  it('busca por apellido sin importar tildes ni mayusculas', async () => {
    expect(apellidos(await as(app, recepcion).get('/api/patients?q=gomez'))).toEqual(['Gómez', 'Gómez Díaz'])
    expect(apellidos(await as(app, recepcion).get('/api/patients?q=PEREZ'))).toEqual(['Pérez'])
  })

  it('busca por varias palabras en cualquier orden', async () => {
    expect(apellidos(await as(app, recepcion).get('/api/patients?q=maria%20perez'))).toEqual(['Pérez'])
    expect(apellidos(await as(app, recepcion).get('/api/patients?q=gomez%20luis'))).toEqual(['Gómez Díaz'])
  })

  it('busca por documento con o sin puntos', async () => {
    expect(apellidos(await as(app, recepcion).get('/api/patients?q=30.123.456'))).toEqual(['Gómez'])
    expect(apellidos(await as(app, recepcion).get('/api/patients?q=28111'))).toEqual(['Pérez'])
  })

  it('busca por telefono parcial', async () => {
    expect(apellidos(await as(app, recepcion).get('/api/patients?q=5555-12'))).toEqual(['Gómez'])
    expect(apellidos(await as(app, recepcion).get('/api/patients?q=4449999'))).toEqual(['Pérez'])
  })

  it('una busqueda sin resultados devuelve lista vacia', async () => {
    const res = await as(app, recepcion).get('/api/patients?q=inexistente')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ items: [], total: 0 })
  })

  it('filtra por estado archivado', async () => {
    expect(apellidos(await as(app, recepcion).get('/api/patients?status=archived'))).toEqual(['Zeta'])
    expect((await as(app, recepcion).get('/api/patients?status=all')).body).toMatchObject({ total: 4 })
  })

  it('pagina los resultados', async () => {
    const primera = await as(app, recepcion).get('/api/patients?pageSize=2&page=1')
    const segunda = await as(app, recepcion).get('/api/patients?pageSize=2&page=2')
    expect(ids(primera)).toHaveLength(2)
    expect(ids(segunda)).toHaveLength(1)
    expect((primera.body as { total: number }).total).toBe(3)
    expect(ids(primera)).not.toContain(ids(segunda)[0])
  })

  it('rechaza parametros de paginacion invalidos', async () => {
    expect((await as(app, recepcion).get('/api/patients?pageSize=500')).status).toBe(400)
    expect((await as(app, recepcion).get('/api/patients?page=0')).status).toBe(400)
  })

  it('el odontologo puede buscar y ver pacientes', async () => {
    const lista = await as(app, odontologo).get('/api/patients?q=gomez')
    expect(lista.status).toBe(200)
    const detalle = await as(app, odontologo).get(`/api/patients/${ids(lista)[0]}`)
    expect(detalle.status).toBe(200)
  })

  it('un escape de comodines no devuelve todo', async () => {
    expect(apellidos(await as(app, recepcion).get('/api/patients?q=%25'))).toEqual([])
  })
})

describe('edicion y archivo', () => {
  it('actualiza parcialmente y la busqueda refleja el cambio', async () => {
    const creado = await as(app, recepcion).post('/api/patients', nuevoPaciente())
    const id = (creado.body as { id: string }).id
    const res = await as(app, recepcion).patch(`/api/patients/${id}`, { lastName: 'Fernández', phone: null })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ lastName: 'Fernández', phone: null, firstName: 'Ana' })
    expect(apellidos(await as(app, recepcion).get('/api/patients?q=fernandez'))).toEqual(['Fernández'])
    expect(apellidos(await as(app, recepcion).get('/api/patients?q=gomez'))).toEqual([])
    expect(apellidos(await as(app, recepcion).get('/api/patients?q=5555'))).toEqual([])
  })

  it('no permite pisar el documento de otro paciente', async () => {
    await seedPatient(db, seed, { documentNumber: '11111111' })
    const creado = await as(app, recepcion).post('/api/patients', nuevoPaciente())
    const id = (creado.body as { id: string }).id
    const res = await as(app, recepcion).patch(`/api/patients/${id}`, { documentNumber: '11111111' })
    expect(res.status).toBe(409)
    expect(codigo(res)).toBe('DUPLICATE_PATIENT')
  })

  it('exige al menos un cambio y valida el documento al cambiar solo el tipo', async () => {
    const creado = await as(app, recepcion).post('/api/patients', nuevoPaciente())
    const id = (creado.body as { id: string }).id
    expect((await as(app, recepcion).patch(`/api/patients/${id}`, {})).status).toBe(400)
    const res = await as(app, recepcion).patch(`/api/patients/${id}`, { documentType: 'PASAPORTE' })
    expect(res.status).toBe(200)
  })

  it('el odontologo no puede editar ni archivar', async () => {
    const paciente = await seedPatient(db, seed)
    expect((await as(app, odontologo).patch(`/api/patients/${paciente.id}`, { firstName: 'X' })).status).toBe(403)
    expect((await as(app, odontologo).post(`/api/patients/${paciente.id}/archive`)).status).toBe(403)
  })

  it('archivar y reactivar es reversible e idempotente', async () => {
    const paciente = await seedPatient(db, seed)
    const archivado = await as(app, recepcion).post(`/api/patients/${paciente.id}/archive`)
    expect(archivado.status).toBe(200)
    expect((archivado.body as { archivedAt: string | null }).archivedAt).not.toBeNull()
    await as(app, recepcion).post(`/api/patients/${paciente.id}/archive`).expect(200)
    expect(await db.auditLog.count({ where: { action: 'PATIENT_ARCHIVED' } })).toBe(1)
    expect(ids(await as(app, recepcion).get('/api/patients'))).not.toContain(paciente.id)

    const reactivado = await as(app, recepcion).post(`/api/patients/${paciente.id}/unarchive`)
    expect((reactivado.body as { archivedAt: string | null }).archivedAt).toBeNull()
    expect(ids(await as(app, recepcion).get('/api/patients'))).toContain(paciente.id)
  })

  it('un paciente inexistente o con id mal formado da 404 y 400', async () => {
    expect((await as(app, recepcion).get('/api/patients/00000000-0000-7000-8000-000000000000')).status).toBe(404)
    expect((await as(app, recepcion).get('/api/patients/no-es-uuid')).status).toBe(400)
  })
})

describe('auditoria y rendimiento', () => {
  it('audita altas y cambios sin guardar datos personales', async () => {
    const creado = await as(app, recepcion).post('/api/patients', nuevoPaciente())
    const id = (creado.body as { id: string }).id
    await as(app, recepcion).patch(`/api/patients/${id}`, { phone: '11 4444-0000' })
    const eventos = await db.auditLog.findMany({ where: { entityType: 'Patient' } })
    expect(eventos.map((e) => e.action).sort()).toEqual(['PATIENT_CREATED', 'PATIENT_UPDATED'])
    expect(eventos.every((e) => e.actorUserId === recepcion.userId)).toBe(true)
    const texto = JSON.stringify(eventos)
    for (const dato of ['Gómez', '30123456', '5555', 'ana@example.com', 'Corrientes']) {
      expect(texto).not.toContain(dato)
    }
  })

  it('busca rapido con miles de pacientes', async () => {
    const filas = Array.from({ length: 5000 }, (_, i) => ({
      organizationId: seed.organizationId,
      firstName: `Nombre${i}`,
      lastName: `Apellido${i}`,
      documentNumber: String(50000000 + i),
      searchText: `apellido${i} nombre${i} ${50000000 + i}`,
    }))
    await db.patient.createMany({ data: filas })
    const inicio = performance.now()
    const res = await as(app, recepcion).get('/api/patients?q=apellido4321')
    const duracion = performance.now() - inicio
    expect(apellidos(res)).toEqual(['Apellido4321'])
    expect(duracion).toBeLessThan(1000)
  })
})
