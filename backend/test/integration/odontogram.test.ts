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
} from '../helpers.js'

const db = testDb()
const app = buildApp(db)
let admin: Client
let recepcion: Client
let odontologo: Client
let pacienteId: string

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const ruta = () => `/api/patients/${pacienteId}/odontogram`

interface Odontograma {
  current: { tooth: number; surface: string | null; condition: string; professional: { displayName: string } }[]
  history: unknown[]
}

beforeEach(async () => {
  await resetDb(db)
  const seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  await seedProfessional(db, seed, { username: 'odontologo', displayName: 'Dra. Paz' })
  pacienteId = (await seedPatient(db, seed)).id
  admin = await loginAs(app, 'admin')
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
})

describe('odontograma', () => {
  it('registra condiciones por superficie y por pieza, con historial', async () => {
    await as(app, odontologo).post(`${ruta()}/findings`, { tooth: 16, surfaces: ['O', 'M'], condition: 'CARIES' }).expect(201)
    await as(app, odontologo).post(`${ruta()}/findings`, { tooth: 16, surfaces: ['O'], condition: 'RESTORATION', note: 'Resina' }).expect(201)
    const res = await as(app, odontologo).post(`${ruta()}/findings`, { tooth: 36, condition: 'MISSING' })
    const odontograma = res.body as Odontograma
    expect(odontograma.current.map((h) => [h.tooth, h.surface, h.condition])).toEqual([
      [16, 'M', 'CARIES'],
      [16, 'O', 'RESTORATION'],
      [36, null, 'MISSING'],
    ])
    expect(odontograma.current[0]?.professional.displayName).toBe('Dra. Paz')
    expect(odontograma.history).toHaveLength(4)
  })

  it('admite dentición temporal y valida pieza, superficies y condición', async () => {
    expect((await as(app, odontologo).post(`${ruta()}/findings`, { tooth: 55, surfaces: ['O'], condition: 'SEALANT' })).status).toBe(201)
    const pieza = await as(app, odontologo).post(`${ruta()}/findings`, { tooth: 19, surfaces: ['O'], condition: 'CARIES' })
    expect([pieza.status, codigo(pieza)]).toEqual([422, 'INVALID_FINDING'])
    const corona = await as(app, odontologo).post(`${ruta()}/findings`, { tooth: 11, surfaces: ['V'], condition: 'CROWN' })
    expect(codigo(corona)).toBe('INVALID_FINDING')
    expect((await as(app, odontologo).post(`${ruta()}/findings`, { tooth: 11, condition: 'BRACKET' })).status).toBe(400)
  })

  it('marcar sano limpia la pieza sin borrar el historial', async () => {
    await as(app, odontologo).post(`${ruta()}/findings`, { tooth: 21, surfaces: ['D'], condition: 'FRACTURE' }).expect(201)
    const res = await as(app, odontologo).post(`${ruta()}/findings`, { tooth: 21, condition: 'HEALTHY' })
    expect((res.body as Odontograma).current).toEqual([])
    expect((res.body as Odontograma).history).toHaveLength(2)
    const registro = await db.toothFinding.findFirstOrThrow()
    await expect(db.toothFinding.delete({ where: { id: registro.id } })).rejects.toThrow()
    await expect(db.toothFinding.update({ where: { id: registro.id }, data: { tooth: 22 } })).rejects.toThrow()
  })

  it('recepcion y administracion reciben 403 y la auditoria no guarda la condicion', async () => {
    await as(app, odontologo).post(`${ruta()}/findings`, { tooth: 16, surfaces: ['O'], condition: 'CARIES' }).expect(201)
    for (const cliente of [recepcion, admin]) {
      expect((await as(app, cliente).get(ruta())).status).toBe(403)
      expect((await as(app, cliente).post(`${ruta()}/findings`, { tooth: 16, condition: 'HEALTHY' })).status).toBe(403)
    }
    const auditoria = JSON.stringify(await db.auditLog.findMany({ where: { action: 'ODONTOGRAM_UPDATED' } }))
    expect(auditoria).not.toContain('CARIES')
  })
})
