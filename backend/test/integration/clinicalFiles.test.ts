import { readdir } from 'node:fs/promises'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  as,
  buildApp,
  loginAs,
  ORIGIN,
  resetDb,
  seedInstall,
  seedPatient,
  seedProfessional,
  seedUser,
  testDb,
  TEST_FILES,
  type Client,
  type Seed,
} from '../helpers.js'

const db = testDb()
const app = buildApp(db)
let seed: Seed
let admin: Client
let recepcion: Client
let odontologo: Client
let pacienteId: string

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 0x20)])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const archivos = (id = pacienteId) => `/api/patients/${id}/files`

function subir(cliente: Client, contenido: Buffer, query: Record<string, string>, id = pacienteId) {
  return request(app)
    .post(`${archivos(id)}?${new URLSearchParams(query).toString()}`)
    .set('Cookie', cliente.cookie)
    .set('Origin', ORIGIN)
    .set('X-CSRF-Token', cliente.csrfToken)
    .set('Content-Type', 'application/octet-stream')
    .send(contenido)
}

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  await seedProfessional(db, seed, { username: 'odontologo', displayName: 'Dra. Paz' })
  pacienteId = (await seedPatient(db, seed)).id
  admin = await loginAs(app, 'admin')
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
})

describe('perfil clinico', () => {
  const perfil = (id = pacienteId) => `/api/patients/${id}/clinical/profile`

  it('el odontologo guarda versiones y ve la vigente; cada consulta queda auditada', async () => {
    expect((await as(app, odontologo).get(perfil())).body).toEqual({ current: null, versions: 0 })
    await as(app, odontologo)
      .put(perfil(), { alerts: 'Alérgico a penicilina', allergies: 'Penicilina', medications: '', background: 'Hipertensión' })
      .expect(200)
    const res = await as(app, odontologo).put(perfil(), {
      alerts: 'Alérgico a penicilina',
      allergies: 'Penicilina',
      medications: 'Enalapril',
      background: 'Hipertensión',
    })
    expect(res.body).toMatchObject({
      current: { alerts: 'Alérgico a penicilina', medications: 'Enalapril', professional: { displayName: 'Dra. Paz' } },
      versions: 2,
    })
    expect(await db.clinicalProfile.count()).toBe(2)
    expect(await db.auditLog.count({ where: { action: 'CLINICAL_PROFILE_VIEWED' } })).toBeGreaterThan(0)
    const auditoria = JSON.stringify(await db.auditLog.findMany())
    expect(auditoria).not.toContain('Penicilina')
  })

  it('recepcion y administracion reciben 403', async () => {
    for (const cliente of [recepcion, admin]) {
      expect((await as(app, cliente).get(perfil())).status).toBe(403)
      expect((await as(app, cliente).put(perfil(), { alerts: null, allergies: null, medications: null, background: null })).status).toBe(403)
    }
  })

  it('las versiones no se pueden modificar ni borrar', async () => {
    await as(app, odontologo).put(perfil(), { alerts: 'x', allergies: null, medications: null, background: null }).expect(200)
    const version = await db.clinicalProfile.findFirstOrThrow()
    await expect(db.clinicalProfile.update({ where: { id: version.id }, data: { alerts: 'otra' } })).rejects.toThrow()
    await expect(db.clinicalProfile.delete({ where: { id: version.id } })).rejects.toThrow()
  })
})

describe('archivos clinicos', () => {
  it('el odontologo sube un PDF y lo descarga solo a traves del backend', async () => {
    const subida = await subir(odontologo, PDF, { filename: 'Estudio panorámico.pdf', category: 'XRAY', description: 'Panorámica' })
    expect(subida.status).toBe(201)
    expect(subida.body).toMatchObject({
      filename: 'Estudio panorámico.pdf',
      mimeType: 'application/pdf',
      size: PDF.length,
      category: 'XRAY',
      professional: { displayName: 'Dra. Paz' },
      archived: false,
    })
    const id = (subida.body as { id: string }).id
    const descarga = await request(app).get(`${archivos()}/${id}/content`).set('Cookie', odontologo.cookie).buffer(true)
    expect(descarga.status).toBe(200)
    expect(descarga.headers['content-type']).toBe('application/pdf')
    expect(descarga.headers['x-content-type-options']).toBe('nosniff')
    expect(descarga.headers['cache-control']).toBe('private, no-store')
    expect(Buffer.from(descarga.body as Buffer).equals(PDF)).toBe(true)
    expect(await db.auditLog.count({ where: { action: 'CLINICAL_FILE_DOWNLOADED' } })).toBe(1)
  })

  it('verifica el tipo por el contenido y corrige la extension', async () => {
    const falso = await subir(odontologo, Buffer.from('<html><script>alert(1)</script>'), { filename: 'virus.pdf', category: 'OTHER' })
    expect([falso.status, codigo(falso)]).toEqual([415, 'UNSUPPORTED_FILE'])
    const png = await subir(odontologo, PNG, { filename: 'foto.pdf', category: 'PHOTO' })
    expect(png.body).toMatchObject({ mimeType: 'image/png', filename: 'foto.pdf.png' })
    const vacio = await subir(odontologo, Buffer.alloc(0), { filename: 'nada.pdf', category: 'OTHER' })
    expect(codigo(vacio)).toBe('EMPTY_FILE')
  })

  it('rechaza archivos mas grandes que el maximo configurado', async () => {
    const grande = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(TEST_FILES.maxBytes)])
    const res = await subir(odontologo, grande, { filename: 'grande.pdf', category: 'STUDY' })
    expect(res.status).toBe(413)
    expect(await db.clinicalFile.count()).toBe(0)
  })

  it('recepcion y administracion no pueden subir, listar ni descargar', async () => {
    const id = ((await subir(odontologo, PDF, { filename: 'a.pdf', category: 'STUDY' })).body as { id: string }).id
    for (const cliente of [recepcion, admin]) {
      expect((await subir(cliente, PDF, { filename: 'b.pdf', category: 'STUDY' })).status).toBe(403)
      expect((await as(app, cliente).get(archivos())).status).toBe(403)
      expect((await as(app, cliente).get(`${archivos()}/${id}/content`)).status).toBe(403)
    }
    expect((await request(app).get(`${archivos()}/${id}/content`)).status).toBe(401)
  })

  it('se puede asociar a una nota clinica del mismo paciente', async () => {
    const nota = (await as(app, odontologo).post(`/api/patients/${pacienteId}/clinical`, { content: 'Se solicita panorámica' }))
      .body as { id: string }
    const ok = await subir(odontologo, PDF, { filename: 'p.pdf', category: 'XRAY', clinicalEntryId: nota.id })
    expect(ok.body).toMatchObject({ clinicalEntryId: nota.id })
    const otro = await seedPatient(db, seed)
    const cruzada = await subir(odontologo, PDF, { filename: 'p.pdf', category: 'XRAY', clinicalEntryId: nota.id }, otro.id)
    expect(codigo(cruzada)).toBe('INVALID_CLINICAL_ENTRY')
  })

  it('archivar oculta el archivo del listado sin borrarlo', async () => {
    const id = ((await subir(odontologo, PDF, { filename: 'a.pdf', category: 'STUDY' })).body as { id: string }).id
    await as(app, odontologo).post(`${archivos()}/${id}/archive`).expect(200)
    expect((await as(app, odontologo).get(archivos())).body).toEqual([])
    expect((await as(app, odontologo).get(`${archivos()}?archived=true`)).body).toHaveLength(1)
    expect((await as(app, odontologo).get(`${archivos()}/${id}/content`)).status).toBe(200)
    await expect(db.clinicalFile.delete({ where: { id } })).rejects.toThrow()
    await expect(db.clinicalFile.update({ where: { id }, data: { filename: 'otro.pdf' } })).rejects.toThrow()
  })

  it('un paciente de otra organizacion o inexistente da 404 y no deja archivos sueltos', async () => {
    const fantasma = '00000000-0000-7000-8000-000000000000'
    const contar = async () => (await readdir(TEST_FILES.dir, { recursive: true }).catch(() => [])).length
    const antes = await contar()
    const res = await subir(odontologo, PDF, { filename: 'a.pdf', category: 'STUDY' }, fantasma)
    expect(res.status).toBe(404)
    await db.patient.update({ where: { id: pacienteId }, data: { archivedAt: new Date() } })
    const archivado = await subir(odontologo, PDF, { filename: 'a.pdf', category: 'STUDY' })
    expect(codigo(archivado)).toBe('PATIENT_ARCHIVED')
    expect(await contar()).toBe(antes)
  })
})
