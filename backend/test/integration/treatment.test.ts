import type request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  as,
  buildApp,
  loginAs,
  resetDb,
  seedInstall,
  seedPatient,
  seedPractice,
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
let endodoncia: { id: string }
let corona: { id: string }

interface Item {
  id: string
  tooth: number | null
  surfaces: string[]
  agreedPrice: string | null
  catalogPrice: string | null
  priced: boolean
  status: string
}
interface Plan {
  id: string
  status: string
  total: string | null
  items: Item[]
}

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const planes = () => `/api/patients/${pacienteId}/treatment-plans`

async function planConItems(): Promise<Plan> {
  const plan = (await as(app, odontologo).post(planes(), { title: 'Rehabilitación' })).body as Plan
  await as(app, odontologo).post(`${planes()}/${plan.id}/items`, { practiceId: endodoncia.id, tooth: 46 }).expect(201)
  const res = await as(app, odontologo).post(`${planes()}/${plan.id}/items`, {
    practiceId: corona.id,
    tooth: 46,
    surfaces: [],
    notes: 'Corona de porcelana',
  })
  return res.body as Plan
}

async function cotizarYAceptar(plan: Plan, precios: string[]): Promise<Plan> {
  for (const [index, item] of plan.items.entries()) {
    await as(app, recepcion).put(`${planes()}/${plan.id}/items/${item.id}/price`, { price: precios[index] }).expect(200)
  }
  return (await as(app, recepcion).post(`${planes()}/${plan.id}/accept`)).body as Plan
}

beforeEach(async () => {
  await resetDb(db)
  const seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  await seedProfessional(db, seed, { username: 'odontologo', displayName: 'Dra. Paz' })
  pacienteId = (await seedPatient(db, seed)).id
  endodoncia = await seedPractice(db, seed, { code: 'END', name: 'Endodoncia', basePrice: '95000.00' })
  corona = await seedPractice(db, seed, { code: 'COR', name: 'Corona', basePrice: '180000.00' })
  admin = await loginAs(app, 'admin')
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
})

describe('plan de tratamiento', () => {
  it('el odontologo arma el plan con piezas y no ve importes; recepcion ve importes y no piezas', async () => {
    const plan = await planConItems()
    expect(plan).toMatchObject({ status: 'DRAFT', total: null })
    expect(plan.items.map((i) => [i.tooth, i.agreedPrice, i.catalogPrice])).toEqual([
      [46, null, null],
      [46, null, null],
    ])
    const [vistaRecepcion] = (await as(app, recepcion).get(planes())).body as Plan[]
    expect(vistaRecepcion?.items.map((i) => [i.tooth, i.surfaces, i.catalogPrice, i.priced])).toEqual([
      [null, [], '95000.00', false],
      [null, [], '180000.00', false],
    ])
    expect(JSON.stringify(vistaRecepcion)).not.toContain('porcelana')
  })

  it('recepcion cotiza y registra la aceptacion; no se acepta con items sin cotizar', async () => {
    const plan = await planConItems()
    const [primero] = plan.items
    await as(app, recepcion).put(`${planes()}/${plan.id}/items/${primero?.id}/price`, { price: '90000' }).expect(200)
    const incompleto = await as(app, recepcion).post(`${planes()}/${plan.id}/accept`)
    expect([incompleto.status, codigo(incompleto)]).toEqual([422, 'UNPRICED_ITEMS'])
    const aceptado = await cotizarYAceptar(plan, ['90000', '170000'])
    expect(aceptado).toMatchObject({ status: 'ACCEPTED', total: '260000.00' })
    const repetido = await as(app, recepcion).post(`${planes()}/${plan.id}/accept`)
    expect(codigo(repetido)).toBe('PLAN_NOT_DRAFT')
  })

  it('cada rol hace solo su parte', async () => {
    const plan = await planConItems()
    const item = plan.items[0]?.id
    expect((await as(app, recepcion).post(planes(), {})).status).toBe(403)
    expect((await as(app, recepcion).post(`${planes()}/${plan.id}/items`, { practiceId: corona.id })).status).toBe(403)
    expect((await as(app, odontologo).put(`${planes()}/${plan.id}/items/${item}/price`, { price: '1' })).status).toBe(403)
    expect((await as(app, odontologo).post(`${planes()}/${plan.id}/accept`)).status).toBe(403)
    expect((await as(app, admin).get(planes())).status).toBe(200)
  })

  it('valida pieza y superficies', async () => {
    const plan = (await as(app, odontologo).post(planes(), {})).body as Plan
    const pieza = await as(app, odontologo).post(`${planes()}/${plan.id}/items`, { practiceId: corona.id, tooth: 99 })
    expect([pieza.status, codigo(pieza)]).toEqual([422, 'INVALID_TOOTH'])
    const sinPieza = await as(app, odontologo).post(`${planes()}/${plan.id}/items`, { practiceId: corona.id, surfaces: ['O'] })
    expect(codigo(sinPieza)).toBe('INVALID_TOOTH')
  })

  it('cancelar todos los items cancela el plan', async () => {
    const plan = await planConItems()
    for (const item of plan.items) {
      await as(app, recepcion).post(`${planes()}/${plan.id}/items/${item.id}/cancel`, { reason: 'El paciente no quiere' }).expect(200)
    }
    const [final] = (await as(app, recepcion).get(planes())).body as Plan[]
    expect(final?.status).toBe('CANCELLED')
  })
})

describe('prestacion desde un item del plan', () => {
  it('toma el precio acordado, la pieza y completa el item y el plan', async () => {
    const plan = await cotizarYAceptar(await planConItems(), ['90000', '170000'])
    const [primero, segundo] = plan.items
    const res = await as(app, odontologo).post(`/api/patients/${pacienteId}/services`, { treatmentItemId: primero?.id })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ tooth: 46, treatmentItemId: primero?.id, price: null, practice: { code: 'END' } })
    const servicios = (await as(app, recepcion).get(`/api/patients/${pacienteId}/services`)).body as {
      price: string
      tooth: number | null
    }[]
    expect(servicios[0]).toMatchObject({ price: '90000.00', tooth: null })

    const odontograma = (await as(app, odontologo).get(`/api/patients/${pacienteId}/odontogram`)).body as {
      planned: { practice: string }[]
      performed: { practice: string; tooth: number }[]
    }
    expect(odontograma.planned.map((p) => p.practice)).toEqual(['Corona'])
    expect(odontograma.performed).toMatchObject([{ practice: 'Endodoncia', tooth: 46 }])

    await as(app, odontologo).post(`/api/patients/${pacienteId}/services`, { treatmentItemId: segundo?.id }).expect(201)
    const [completo] = (await as(app, recepcion).get(planes())).body as Plan[]
    expect(completo?.status).toBe('COMPLETED')
    const repetido = await as(app, odontologo).post(`/api/patients/${pacienteId}/services`, { treatmentItemId: segundo?.id })
    expect(codigo(repetido)).toBe('ITEM_CLOSED')
  })

  it('anular la prestacion devuelve el item a pendiente', async () => {
    const plan = await cotizarYAceptar(await planConItems(), ['90000', '170000'])
    const servicio = (await as(app, odontologo).post(`/api/patients/${pacienteId}/services`, { treatmentItemId: plan.items[0]?.id }))
      .body as { id: string }
    await as(app, recepcion).post(`/api/patients/${pacienteId}/services/${servicio.id}/void`, { reason: 'Error de carga' }).expect(200)
    const [final] = (await as(app, recepcion).get(planes())).body as Plan[]
    expect(final?.items[0]?.status).toBe('PLANNED')
    expect(final?.status).toBe('ACCEPTED')
  })

  it('solo el odontologo registra la pieza tratada en una prestacion suelta', async () => {
    const perfil = await db.professionalProfile.findFirstOrThrow()
    const deRecepcion = await as(app, recepcion).post(`/api/patients/${pacienteId}/services`, {
      practiceId: corona.id,
      professionalId: perfil.id,
      tooth: 21,
    })
    expect(deRecepcion.status).toBe(403)
    const conPieza = await as(app, odontologo).post(`/api/patients/${pacienteId}/services`, {
      practiceId: corona.id,
      tooth: 21,
      surfaces: [],
    })
    expect(conPieza.body).toMatchObject({ tooth: 21 })
    const invalida = await as(app, odontologo).post(`/api/patients/${pacienteId}/services`, { practiceId: corona.id, tooth: 9 })
    expect(codigo(invalida)).toBe('INVALID_TOOTH')
  })
})
