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
  type Seed,
} from '../helpers.js'

const db = testDb()
const app = buildApp(db)
let seed: Seed
let admin: Client
let recepcion: Client
let odontologo: Client
let pacienteId: string
let perfilId: string
let otroPerfilId: string
let consulta: { id: string }
let limpieza: { id: string }

const DIA = 86_400_000
const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const servicios = (id = pacienteId) => `/api/patients/${id}/services`
const pagos = (id = pacienteId) => `/api/patients/${id}/payments`
const cuenta = (id = pacienteId) => `/api/patients/${id}/account`

interface Servicio {
  id: string
  price: string | null
  catalogPrice: string | null
  paid: string | null
  pending: string | null
  status: string
  voidable: boolean
}

interface Pago {
  id: string
  amount: string
  method: string
  allocated: string
  unallocated: string
  status: string
  voidable: boolean
}

interface Cuenta {
  balance: string
  totalServices: string
  totalPayments: string
  availableCredit: string
  services: Servicio[]
  payments: Pago[]
}

async function leerCuenta(cliente: Client = recepcion, id = pacienteId): Promise<Cuenta> {
  return (await as(app, cliente).get(cuenta(id))).body as Cuenta
}

async function registrar(practica: { id: string }, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await as(app, odontologo).post(servicios(), { practiceId: practica.id, ...extra })
  expect(res.status).toBe(201)
  return (res.body as { id: string }).id
}

const cobrar = (
  lineas: { amount: string; method?: string; externalReference?: string }[],
  extra: Record<string, unknown> = {},
  cliente: Client = recepcion,
  id = pacienteId,
) => as(app, cliente).post(pagos(id), { lines: lineas.map((l) => ({ method: 'CASH', ...l })), ...extra })

async function pagar(amount: string, extra: Record<string, unknown> = {}): Promise<Pago> {
  const res = await cobrar([{ amount }], extra)
  expect(res.status).toBe(201)
  return (res.body as { payments: Pago[] }).payments[0] as Pago
}

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  perfilId = (await seedProfessional(db, seed, { username: 'odontologo', displayName: 'Dra. Paz' })).profile.id
  otroPerfilId = (await seedProfessional(db, seed, { username: 'otro', displayName: 'Dr. Gil' })).profile.id
  pacienteId = (await seedPatient(db, seed)).id
  consulta = await seedPractice(db, seed, { code: 'CON', name: 'Consulta', basePrice: '10000.00' })
  limpieza = await seedPractice(db, seed, { code: 'LIM', name: 'Limpieza', basePrice: '25000.50' })
  admin = await loginAs(app, 'admin')
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
})

describe('registro de prestaciones', () => {
  it('el odontologo registra a su nombre y no ve ningun importe', async () => {
    const res = await as(app, odontologo).post(servicios(), { practiceId: limpieza.id })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      practice: { code: 'LIM' },
      professional: { id: perfilId, displayName: 'Dra. Paz' },
      price: null,
      catalogPrice: null,
      paid: null,
      pending: null,
      status: 'ACTIVE',
    })
    const lista = (await as(app, odontologo).get(servicios())).body as Servicio[]
    expect(lista.every((s) => s.price === null && s.pending === null)).toBe(true)
    const desdeRecepcion = (await as(app, recepcion).get(servicios())).body as Servicio[]
    expect(desdeRecepcion[0]).toMatchObject({ price: '25000.50', catalogPrice: '25000.50', pending: '25000.50' })
  })

  it('el odontologo no registra a nombre de otro ni define precios', async () => {
    const ajeno = await as(app, odontologo).post(servicios(), { practiceId: consulta.id, professionalId: otroPerfilId })
    expect(ajeno.status).toBe(403)
    const conPrecio = await as(app, odontologo).post(servicios(), { practiceId: consulta.id, price: '5000' })
    expect(conPrecio.status).toBe(403)
    expect(await db.performedService.count()).toBe(0)
  })

  it('recepcion y administracion registran eligiendo el profesional y pueden fijar otro precio', async () => {
    const sinProfesional = await as(app, recepcion).post(servicios(), { practiceId: consulta.id })
    expect([sinProfesional.status, codigo(sinProfesional)]).toEqual([422, 'PROFESSIONAL_REQUIRED'])
    const res = await as(app, recepcion).post(servicios(), {
      practiceId: consulta.id,
      professionalId: otroPerfilId,
      price: '8000',
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      professional: { displayName: 'Dr. Gil' },
      price: '8000.00',
      catalogPrice: '10000.00',
    })
    const deAdmin = await as(app, admin).post(servicios(), { practiceId: consulta.id, professionalId: perfilId })
    expect(deAdmin.body).toMatchObject({ price: '10000.00' })
  })

  it('el precio queda fijo aunque el catalogo cambie despues', async () => {
    const id = await registrar(consulta)
    await as(app, admin).patch(`/api/practices/${consulta.id}`, { basePrice: '99999' }).expect(200)
    const lista = (await as(app, recepcion).get(servicios())).body as Servicio[]
    expect(lista.find((s) => s.id === id)?.price).toBe('10000.00')
  })

  it('rechaza practicas inactivas, fechas futuras y pacientes archivados', async () => {
    const inactiva = await seedPractice(db, seed, { active: false })
    const a = await as(app, odontologo).post(servicios(), { practiceId: inactiva.id })
    expect([a.status, codigo(a)]).toEqual([422, 'INVALID_PRACTICE'])
    const futura = new Date(Date.now() + DIA).toISOString()
    const b = await as(app, odontologo).post(servicios(), { practiceId: consulta.id, performedAt: futura })
    expect([b.status, codigo(b)]).toEqual([422, 'FUTURE_DATE'])
    await db.patient.update({ where: { id: pacienteId }, data: { archivedAt: new Date() } })
    const c = await as(app, odontologo).post(servicios(), { practiceId: consulta.id })
    expect([c.status, codigo(c)]).toEqual([422, 'PATIENT_ARCHIVED'])
  })
})

describe('ajuste de precio', () => {
  it('recepcion ajusta el precio y queda auditado con el anterior', async () => {
    const id = await registrar(consulta)
    const res = await as(app, recepcion).post(`${servicios()}/${id}/price`, { price: '9000' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ price: '9000.00', catalogPrice: '10000.00', pending: '9000.00' })
    const auditoria = await db.auditLog.findFirstOrThrow({ where: { action: 'SERVICE_PRICE_CHANGED' } })
    expect(auditoria.metadata).toMatchObject({ before: '10000.00', after: '9000.00' })
    expect((await leerCuenta()).balance).toBe('9000.00')
  })

  it('no baja de lo ya pagado, no toca anuladas y el odontologo no puede', async () => {
    const id = await registrar(consulta)
    await pagar('6000')
    const debajo = await as(app, recepcion).post(`${servicios()}/${id}/price`, { price: '5000' })
    expect([debajo.status, codigo(debajo)]).toEqual([422, 'PRICE_BELOW_PAID'])
    expect((await as(app, recepcion).post(`${servicios()}/${id}/price`, { price: '6000' })).status).toBe(200)
    expect((await as(app, odontologo).post(`${servicios()}/${id}/price`, { price: '7000' })).status).toBe(403)
    const otra = await registrar(limpieza)
    await as(app, admin).post(`${servicios()}/${otra}/void`, { reason: 'Error' }).expect(200)
    const anulada = await as(app, recepcion).post(`${servicios()}/${otra}/price`, { price: '100' })
    expect(anulada.status).toBe(409)
  })
})

describe('anulaciones', () => {
  async function prestacionDeAyer(): Promise<string> {
    const servicio = await db.performedService.create({
      data: {
        organizationId: seed.organizationId,
        patientId: pacienteId,
        professionalId: perfilId,
        practiceId: consulta.id,
        price: '10000.00',
        catalogPrice: '10000.00',
        performedAt: new Date(Date.now() - 2 * DIA),
        createdById: recepcion.userId,
        createdAt: new Date(Date.now() - 2 * DIA),
      },
    })
    return servicio.id
  }

  it('recepcion anula con motivo lo cargado hoy y la prestacion se conserva', async () => {
    const id = await registrar(consulta)
    expect((await as(app, odontologo).post(`${servicios()}/${id}/void`, { reason: 'Error de carga' })).status).toBe(403)
    expect((await as(app, recepcion).post(`${servicios()}/${id}/void`, {})).status).toBe(400)
    const res = await as(app, recepcion).post(`${servicios()}/${id}/void`, { reason: 'Error de carga' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'VOIDED', voidReason: 'Error de carga', pending: '0.00', voidable: false })
    expect(codigo(await as(app, admin).post(`${servicios()}/${id}/void`, { reason: 'Otra vez' }))).toBe('ALREADY_VOIDED')
    expect(await db.performedService.count()).toBe(1)
    expect((await leerCuenta()).balance).toBe('0.00')
  })

  it('lo de dias anteriores solo lo anula administracion', async () => {
    const id = await prestacionDeAyer()
    const vista = (await leerCuenta()).services.find((s) => s.id === id)
    expect(vista?.voidable).toBe(false)
    expect((await leerCuenta(admin)).services.find((s) => s.id === id)?.voidable).toBe(true)
    const res = await as(app, recepcion).post(`${servicios()}/${id}/void`, { reason: 'Error de carga' })
    expect([res.status, codigo(res)]).toEqual([403, 'VOID_WINDOW_CLOSED'])
    expect((await as(app, admin).post(`${servicios()}/${id}/void`, { reason: 'Error de carga' })).status).toBe(200)
  })

  it('pagos: recepcion anula los de hoy y no los anteriores', async () => {
    await registrar(consulta)
    const deHoy = await pagar('1000')
    expect(deHoy.voidable).toBe(true)
    const viejo = await db.payment.create({
      data: {
        organizationId: seed.organizationId,
        patientId: pacienteId,
        amount: '500.00',
        method: 'CASH',
        receivedAt: new Date(Date.now() - 3 * DIA),
        createdById: recepcion.userId,
        createdAt: new Date(Date.now() - 3 * DIA),
      },
    })
    expect((await as(app, recepcion).post(`${pagos()}/${deHoy.id}/void`, { reason: 'Error' })).status).toBe(200)
    const rechazado = await as(app, recepcion).post(`${pagos()}/${viejo.id}/void`, { reason: 'Error' })
    expect([rechazado.status, codigo(rechazado)]).toEqual([403, 'VOID_WINDOW_CLOSED'])
    expect((await as(app, admin).post(`${pagos()}/${viejo.id}/void`, { reason: 'Error' })).status).toBe(200)
  })

  it('anular un pago lo conserva, lo saca del saldo y libera lo asignado', async () => {
    const servicio = await registrar(consulta)
    const pago = await pagar('10000')
    const res = await as(app, recepcion).post(`${pagos()}/${pago.id}/void`, { reason: 'Cargado dos veces' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'VOIDED', voidReason: 'Cargado dos veces', allocated: '0.00' })
    const final = await leerCuenta()
    expect(final).toMatchObject({ balance: '10000.00', totalPayments: '0.00' })
    expect(final.services.find((s) => s.id === servicio)).toMatchObject({ paid: '0.00', pending: '10000.00' })
    expect(final.payments).toHaveLength(1)
    expect(codigo(await as(app, admin).post(`${pagos()}/${pago.id}/void`, { reason: 'Otra vez' }))).toBe('ALREADY_VOIDED')
  })

  it('anular una prestacion pagada deja el pago como saldo a favor', async () => {
    const servicio = await registrar(consulta)
    await pagar('10000')
    await as(app, admin).post(`${servicios()}/${servicio}/void`, { reason: 'No se hizo' }).expect(200)
    const final = await leerCuenta()
    expect(final).toMatchObject({ balance: '-10000.00', availableCredit: '10000.00' })
    expect(final.payments[0]).toMatchObject({ allocated: '0.00', unallocated: '10000.00' })
  })
})

describe('cobros', () => {
  it('el saldo se deriva: prestaciones menos pagos', async () => {
    await registrar(consulta)
    await registrar(limpieza)
    expect(await leerCuenta()).toMatchObject({ balance: '35000.50', totalServices: '35000.50', totalPayments: '0.00' })
    await pagar('5000')
    expect(await leerCuenta()).toMatchObject({ balance: '30000.50', totalPayments: '5000.00' })
  })

  it('un pago parcial se aplica primero a la prestacion mas antigua', async () => {
    const antigua = await registrar(consulta, { performedAt: new Date(Date.now() - 2 * DIA).toISOString() })
    const reciente = await registrar(limpieza)
    const pago = await pagar('4000')
    expect(pago).toMatchObject({ amount: '4000.00', allocated: '4000.00', unallocated: '0.00' })
    const { services } = await leerCuenta()
    expect(services.find((s) => s.id === antigua)).toMatchObject({ paid: '4000.00', pending: '6000.00' })
    expect(services.find((s) => s.id === reciente)).toMatchObject({ paid: '0.00', pending: '25000.50' })
  })

  it('combina varios medios de pago en un mismo cobro', async () => {
    const id = await registrar(consulta)
    const res = await cobrar([
      { amount: '6000', method: 'CASH' },
      { amount: '4000', method: 'MERCADOPAGO', externalReference: '  MP-123  ' },
    ])
    expect(res.status).toBe(201)
    const { payments } = res.body as { payments: (Pago & { externalReference: string | null })[] }
    expect(payments.map((p) => [p.method, p.amount, p.allocated])).toEqual([
      ['CASH', '6000.00', '6000.00'],
      ['MERCADOPAGO', '4000.00', '4000.00'],
    ])
    expect(payments[1]?.externalReference).toBe('MP-123')
    const final = await leerCuenta()
    expect(final.balance).toBe('0.00')
    expect(final.services.find((s) => s.id === id)?.pending).toBe('0.00')
  })

  it('aplica el cobro solo a las prestaciones elegidas', async () => {
    await registrar(consulta)
    const elegida = await registrar(limpieza)
    await pagar('3000', { serviceIds: [elegida] })
    const { services } = await leerCuenta()
    expect(services.find((s) => s.id === elegida)?.paid).toBe('3000.00')
    expect(services.filter((s) => s.id !== elegida).every((s) => s.paid === '0.00')).toBe(true)
  })

  it('rechaza prestaciones elegidas inexistentes, saldadas o anuladas', async () => {
    const saldada = await registrar(consulta)
    await pagar('10000')
    const anulada = await registrar(limpieza)
    await as(app, admin).post(`${servicios()}/${anulada}/void`, { reason: 'Error' }).expect(200)
    for (const ids of [[saldada], [anulada], ['00000000-0000-7000-8000-000000000000']]) {
      const res = await cobrar([{ amount: '100' }], { serviceIds: ids })
      expect([res.status, codigo(res)]).toEqual([422, 'INVALID_SERVICES'])
    }
  })

  it('valida importes, medios, fecha y que haya al menos un medio', async () => {
    for (const linea of [
      { amount: '0' },
      { amount: '-5' },
      { amount: '10.999' },
      { amount: 'abc' },
      { amount: '100', method: 'BITCOIN' },
    ]) {
      expect((await cobrar([linea])).status).toBe(400)
    }
    expect((await as(app, recepcion).post(pagos(), { lines: [] })).status).toBe(400)
    const futura = new Date(Date.now() + DIA).toISOString()
    const res = await cobrar([{ amount: '100' }], { receivedAt: futura })
    expect([res.status, codigo(res)]).toEqual([422, 'FUTURE_DATE'])
    expect(await db.payment.count()).toBe(0)
  })

  it('pagos simultaneos no asignan de mas una misma prestacion', async () => {
    const id = await registrar(consulta)
    const respuestas = await Promise.all(Array.from({ length: 6 }, () => cobrar([{ amount: '3000' }])))
    expect(respuestas.every((r) => r.status === 201)).toBe(true)
    const final = await leerCuenta()
    expect(final.services.find((s) => s.id === id)).toMatchObject({ paid: '10000.00', pending: '0.00' })
    expect(final).toMatchObject({ balance: '-8000.00', availableCredit: '8000.00' })
    const asignado = await db.paymentAllocation.aggregate({ _sum: { amount: true } })
    expect(asignado._sum.amount?.toFixed(2)).toBe('10000.00')
  })
})

describe('saldo a favor', () => {
  it('lo que excede queda a favor y se usa como medio de pago en una prestacion posterior', async () => {
    await registrar(consulta)
    const pago = await pagar('15000')
    expect(pago).toMatchObject({ allocated: '10000.00', unallocated: '5000.00' })
    expect(await leerCuenta()).toMatchObject({ balance: '-5000.00', availableCredit: '5000.00' })

    const nueva = await registrar(limpieza)
    expect((await leerCuenta()).services.find((s) => s.id === nueva)?.pending).toBe('25000.50')
    const res = await cobrar([{ amount: '20000.50', method: 'TRANSFER' }], { credit: '5000' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ creditApplied: '5000.00' })
    const final = await leerCuenta()
    expect(final).toMatchObject({ balance: '0.00', availableCredit: '0.00', totalPayments: '35000.50' })
    expect(final.services.find((s) => s.id === nueva)).toMatchObject({ paid: '25000.50', pending: '0.00' })
    expect(await db.auditLog.count({ where: { action: 'CREDIT_APPLIED' } })).toBe(1)
  })

  it('se puede pagar solo con saldo a favor', async () => {
    await registrar(consulta)
    await pagar('12000')
    const nueva = await registrar(consulta)
    const res = await as(app, recepcion).post(pagos(), { credit: '2000', serviceIds: [nueva] })
    expect(res.status).toBe(201)
    expect((await leerCuenta()).services.find((s) => s.id === nueva)).toMatchObject({ paid: '2000.00', pending: '8000.00' })
  })

  it('no se usa mas saldo del disponible ni mas de lo que falta pagar', async () => {
    await registrar(consulta)
    await pagar('11000')
    await registrar(consulta)
    const deMas = await as(app, recepcion).post(pagos(), { credit: '1500' })
    expect([deMas.status, codigo(deMas)]).toEqual([422, 'INSUFFICIENT_CREDIT'])
    await pagar('20000')
    const excede = await as(app, recepcion).post(pagos(), { credit: '500' })
    expect([excede.status, codigo(excede)]).toEqual([422, 'CREDIT_EXCEEDS_PENDING'])
  })

  it('un precio ajustado hacia arriba vuelve a dejar pendiente y se cubre con el saldo', async () => {
    const id = await registrar(consulta)
    await pagar('12000')
    await as(app, recepcion).post(`${servicios()}/${id}/price`, { price: '11000' }).expect(200)
    await as(app, recepcion).post(pagos(), { credit: '1000' }).expect(201)
    expect(await leerCuenta()).toMatchObject({ balance: '-1000.00', availableCredit: '1000.00' })
    expect((await leerCuenta()).services[0]).toMatchObject({ paid: '11000.00', pending: '0.00' })
  })
})

describe('integridad en la base', () => {
  it('impide borrar prestaciones o cambiar otra cosa que el precio o la anulacion', async () => {
    const id = await registrar(consulta)
    await expect(db.performedService.delete({ where: { id } })).rejects.toThrow()
    await expect(db.performedService.update({ where: { id }, data: { catalogPrice: '1' } })).rejects.toThrow()
    await expect(db.performedService.update({ where: { id }, data: { practiceId: limpieza.id } })).rejects.toThrow()
    await as(app, admin).post(`${servicios()}/${id}/void`, { reason: 'Prueba' }).expect(200)
    await expect(db.performedService.update({ where: { id }, data: { price: '1' } })).rejects.toThrow()
  })

  it('impide borrar o alterar pagos y asignaciones', async () => {
    await registrar(consulta)
    const pago = await pagar('1000')
    await expect(db.payment.delete({ where: { id: pago.id } })).rejects.toThrow()
    await expect(db.payment.update({ where: { id: pago.id }, data: { amount: '1' } })).rejects.toThrow()
    const asignacion = await db.paymentAllocation.findFirstOrThrow({ where: { paymentId: pago.id } })
    await expect(db.paymentAllocation.delete({ where: { id: asignacion.id } })).rejects.toThrow()
    await expect(db.paymentAllocation.update({ where: { id: asignacion.id }, data: { amount: '1' } })).rejects.toThrow()
  })

  it('audita registro, pago, ajuste y anulaciones', async () => {
    const servicio = await registrar(consulta)
    const pago = await pagar('1000')
    await as(app, recepcion).post(`${servicios()}/${servicio}/price`, { price: '9000' }).expect(200)
    await as(app, admin).post(`${pagos()}/${pago.id}/void`, { reason: 'Prueba' }).expect(200)
    await as(app, admin).post(`${servicios()}/${servicio}/void`, { reason: 'Prueba' }).expect(200)
    const acciones = (await db.auditLog.findMany()).map((a) => a.action)
    expect(acciones).toEqual(
      expect.arrayContaining([
        'SERVICE_RECORDED',
        'PAYMENT_RECORDED',
        'SERVICE_PRICE_CHANGED',
        'PAYMENT_VOIDED',
        'SERVICE_VOIDED',
      ]),
    )
  })
})

describe('acceso a la cuenta', () => {
  it('el odontologo no ve la cuenta ni cobra', async () => {
    await registrar(consulta)
    expect((await as(app, odontologo).get(cuenta())).status).toBe(403)
    expect((await cobrar([{ amount: '100' }], {}, odontologo)).status).toBe(403)
    expect((await as(app, odontologo).get('/api/debtors')).status).toBe(403)
  })

  it('un paciente inexistente da 404', async () => {
    const fantasma = '00000000-0000-7000-8000-000000000000'
    expect((await as(app, recepcion).get(cuenta(fantasma))).status).toBe(404)
    expect((await cobrar([{ amount: '100' }], {}, recepcion, fantasma)).status).toBe(404)
  })
})

describe('saldos pendientes', () => {
  it('lista solo a quienes deben, de mayor a menor deuda', async () => {
    const otro = await seedPatient(db, seed, { firstName: 'Ana', lastName: 'Zapata' })
    const alDia = await seedPatient(db, seed, { firstName: 'Beto', lastName: 'Alvarez' })
    await registrar(consulta)
    const registrarA = (id: string, practica: { id: string }) =>
      as(app, odontologo).post(servicios(id), { practiceId: practica.id }).expect(201)
    await registrarA(otro.id, limpieza)
    await registrarA(alDia.id, consulta)
    await cobrar([{ amount: '10000' }], {}, recepcion, alDia.id).expect(201)

    const res = await as(app, recepcion).get('/api/debtors')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { patientId: otro.id, fullName: 'Zapata, Ana', balance: '25000.50' },
      { patientId: pacienteId, fullName: expect.any(String) as string, balance: '10000.00' },
    ])
  })

  it('no cuenta lo anulado', async () => {
    const id = await registrar(consulta)
    await as(app, admin).post(`${servicios()}/${id}/void`, { reason: 'Error' }).expect(200)
    expect((await as(app, admin).get('/api/debtors')).body).toEqual([])
  })
})
