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
let consulta: { id: string }
let limpieza: { id: string }

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const servicios = (id = pacienteId) => `/api/patients/${id}/services`
const pagos = (id = pacienteId) => `/api/patients/${id}/payments`
const cuenta = (id = pacienteId) => `/api/patients/${id}/account`

interface Cuenta {
  balance: string
  totalServices: string
  totalPayments: string
  services: { id: string; price: string; paid: string; pending: string; status: string }[]
  payments: { id: string; amount: string; allocated: string; unallocated: string; status: string }[]
}

async function leerCuenta(cliente: Client = recepcion, id = pacienteId): Promise<Cuenta> {
  return (await as(app, cliente).get(cuenta(id))).body as Cuenta
}

async function registrar(practica: { id: string }, performedAt?: string): Promise<string> {
  const res = await as(app, odontologo).post(servicios(), {
    practiceId: practica.id,
    ...(performedAt ? { performedAt } : {}),
  })
  expect(res.status).toBe(201)
  return (res.body as { id: string }).id
}

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'admin', roles: ['ADMIN'] })
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  await seedProfessional(db, seed, { username: 'odontologo', displayName: 'Dra. Paz' })
  pacienteId = (await seedPatient(db, seed)).id
  consulta = await seedPractice(db, seed, { code: 'CON', name: 'Consulta', basePrice: '10000.00' })
  limpieza = await seedPractice(db, seed, { code: 'LIM', name: 'Limpieza', basePrice: '25000.50' })
  admin = await loginAs(app, 'admin')
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
})

describe('prestaciones', () => {
  it('el odontologo registra una prestacion con el precio del catalogo y a su nombre', async () => {
    const res = await as(app, odontologo).post(servicios(), { practiceId: limpieza.id })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      practice: { code: 'LIM' },
      professional: { displayName: 'Dra. Paz' },
      price: '25000.50',
      paid: '0.00',
      pending: '25000.50',
      status: 'ACTIVE',
    })
  })

  it('el precio queda fijo aunque el catalogo cambie despues', async () => {
    const id = await registrar(consulta)
    await as(app, admin).patch(`/api/practices/${consulta.id}`, { basePrice: '99999' }).expect(200)
    const lista = (await as(app, odontologo).get(servicios())).body as { id: string; price: string }[]
    expect(lista.find((s) => s.id === id)?.price).toBe('10000.00')
  })

  it('solo el odontologo registra; recepcion y administracion reciben 403', async () => {
    for (const cliente of [recepcion, admin]) {
      expect((await as(app, cliente).post(servicios(), { practiceId: consulta.id })).status).toBe(403)
    }
    expect(await db.performedService.count()).toBe(0)
  })

  it('rechaza practicas inactivas, fechas futuras y pacientes archivados', async () => {
    const inactiva = await seedPractice(db, seed, { active: false })
    const a = await as(app, odontologo).post(servicios(), { practiceId: inactiva.id })
    expect([a.status, codigo(a)]).toEqual([422, 'INVALID_PRACTICE'])
    const futura = new Date(Date.now() + 86_400_000).toISOString()
    const b = await as(app, odontologo).post(servicios(), { practiceId: consulta.id, performedAt: futura })
    expect([b.status, codigo(b)]).toEqual([422, 'FUTURE_DATE'])
    await db.patient.update({ where: { id: pacienteId }, data: { archivedAt: new Date() } })
    const c = await as(app, odontologo).post(servicios(), { practiceId: consulta.id })
    expect([c.status, codigo(c)]).toEqual([422, 'PATIENT_ARCHIVED'])
  })

  it('solo administracion anula, con motivo, y la prestacion se conserva', async () => {
    const id = await registrar(consulta)
    expect((await as(app, odontologo).post(`${servicios()}/${id}/void`, { reason: 'Error de carga' })).status).toBe(403)
    expect((await as(app, recepcion).post(`${servicios()}/${id}/void`, { reason: 'Error de carga' })).status).toBe(403)
    expect((await as(app, admin).post(`${servicios()}/${id}/void`, {})).status).toBe(400)
    const res = await as(app, admin).post(`${servicios()}/${id}/void`, { reason: 'Error de carga' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'VOIDED', voidReason: 'Error de carga', pending: '0.00' })
    expect(codigo(await as(app, admin).post(`${servicios()}/${id}/void`, { reason: 'Otra vez' }))).toBe('ALREADY_VOIDED')
    expect(await db.performedService.count()).toBe(1)
    expect((await leerCuenta()).balance).toBe('0.00')
  })

  it('la base impide borrar o alterar prestaciones', async () => {
    const id = await registrar(consulta)
    await expect(db.performedService.delete({ where: { id } })).rejects.toThrow()
    await expect(db.performedService.update({ where: { id }, data: { price: '1' } })).rejects.toThrow()
    expect((await db.performedService.findUniqueOrThrow({ where: { id } })).price.toFixed(2)).toBe('10000.00')
  })
})

describe('cuenta y pagos', () => {
  it('el saldo se deriva: prestaciones menos pagos', async () => {
    await registrar(consulta)
    await registrar(limpieza)
    expect(await leerCuenta()).toMatchObject({ balance: '35000.50', totalServices: '35000.50', totalPayments: '0.00' })
    const pago = await as(app, recepcion).post(pagos(), { amount: '5000', method: 'CASH' })
    expect(pago.status).toBe(201)
    expect(await leerCuenta()).toMatchObject({ balance: '30000.50', totalPayments: '5000.00' })
  })

  it('un pago parcial se aplica primero a la prestacion mas antigua', async () => {
    const antigua = await registrar(consulta, new Date(Date.now() - 2 * 86_400_000).toISOString())
    const reciente = await registrar(limpieza)
    const pago = await as(app, recepcion).post(pagos(), { amount: '4000', method: 'TRANSFER' })
    expect(pago.body).toMatchObject({ amount: '4000.00', allocated: '4000.00', unallocated: '0.00' })
    const { services } = await leerCuenta()
    expect(services.find((s) => s.id === antigua)).toMatchObject({ paid: '4000.00', pending: '6000.00' })
    expect(services.find((s) => s.id === reciente)).toMatchObject({ paid: '0.00', pending: '25000.50' })
  })

  it('varios pagos parciales saldan una prestacion', async () => {
    const id = await registrar(consulta)
    await as(app, recepcion).post(pagos(), { amount: '6000', method: 'CASH' }).expect(201)
    await as(app, recepcion).post(pagos(), { amount: '4000', method: 'CARD' }).expect(201)
    const cuentaFinal = await leerCuenta()
    expect(cuentaFinal.balance).toBe('0.00')
    expect(cuentaFinal.services.find((s) => s.id === id)).toMatchObject({ pending: '0.00', paid: '10000.00' })
  })

  it('aplica el pago solo a las prestaciones elegidas', async () => {
    await registrar(consulta)
    const elegida = await registrar(limpieza)
    await as(app, recepcion).post(pagos(), { amount: '3000', method: 'CASH', serviceIds: [elegida] }).expect(201)
    const { services } = await leerCuenta()
    expect(services.find((s) => s.id === elegida)?.paid).toBe('3000.00')
    expect(services.filter((s) => s.id !== elegida).every((s) => s.paid === '0.00')).toBe(true)
  })

  it('rechaza prestaciones elegidas inexistentes, saldadas o anuladas', async () => {
    const saldada = await registrar(consulta)
    await as(app, recepcion).post(pagos(), { amount: '10000', method: 'CASH' }).expect(201)
    const anulada = await registrar(limpieza)
    await as(app, admin).post(`${servicios()}/${anulada}/void`, { reason: 'Error' }).expect(200)
    for (const ids of [[saldada], [anulada], ['00000000-0000-7000-8000-000000000000']]) {
      const res = await as(app, recepcion).post(pagos(), { amount: '100', method: 'CASH', serviceIds: ids })
      expect([res.status, codigo(res)]).toEqual([422, 'INVALID_SERVICES'])
    }
  })

  it('lo que excede lo pendiente queda como saldo a favor', async () => {
    await registrar(consulta)
    const pago = await as(app, recepcion).post(pagos(), { amount: '15000', method: 'CASH' })
    expect(pago.body).toMatchObject({ allocated: '10000.00', unallocated: '5000.00' })
    expect((await leerCuenta()).balance).toBe('-5000.00')
  })

  it('guarda la referencia del medio de pago, incluido Mercado Pago', async () => {
    const res = await as(app, recepcion).post(pagos(), {
      amount: '2500.75',
      method: 'MERCADOPAGO',
      externalReference: '  MP-123456  ',
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ method: 'MERCADOPAGO', externalReference: 'MP-123456', amount: '2500.75' })
  })

  it('valida importe, medio y fecha', async () => {
    for (const body of [
      { amount: '0', method: 'CASH' },
      { amount: '-5', method: 'CASH' },
      { amount: '10.999', method: 'CASH' },
      { amount: 'abc', method: 'CASH' },
      { amount: '100', method: 'BITCOIN' },
    ]) {
      expect((await as(app, recepcion).post(pagos(), body)).status).toBe(400)
    }
    const futura = new Date(Date.now() + 86_400_000).toISOString()
    const res = await as(app, recepcion).post(pagos(), { amount: '100', method: 'CASH', receivedAt: futura })
    expect([res.status, codigo(res)]).toEqual([422, 'FUTURE_DATE'])
    expect(await db.payment.count()).toBe(0)
  })

  it('anular un pago lo conserva, lo saca del saldo y libera lo asignado', async () => {
    const servicio = await registrar(consulta)
    const pago = (await as(app, recepcion).post(pagos(), { amount: '10000', method: 'CASH' })).body as { id: string }
    expect((await as(app, recepcion).post(`${pagos()}/${pago.id}/void`, { reason: 'Error' })).status).toBe(403)
    const res = await as(app, admin).post(`${pagos()}/${pago.id}/void`, { reason: 'Cargado dos veces' })
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
    await as(app, recepcion).post(pagos(), { amount: '10000', method: 'CASH' }).expect(201)
    await as(app, admin).post(`${servicios()}/${servicio}/void`, { reason: 'No se hizo' }).expect(200)
    const final = await leerCuenta()
    expect(final.balance).toBe('-10000.00')
    expect(final.payments[0]).toMatchObject({ allocated: '0.00', unallocated: '10000.00' })
  })

  it('la base impide borrar o alterar pagos y asignaciones', async () => {
    await registrar(consulta)
    const pago = (await as(app, recepcion).post(pagos(), { amount: '1000', method: 'CASH' })).body as { id: string }
    await expect(db.payment.delete({ where: { id: pago.id } })).rejects.toThrow()
    await expect(db.payment.update({ where: { id: pago.id }, data: { amount: '1' } })).rejects.toThrow()
    const asignacion = await db.paymentAllocation.findFirstOrThrow({ where: { paymentId: pago.id } })
    await expect(db.paymentAllocation.delete({ where: { id: asignacion.id } })).rejects.toThrow()
    await expect(db.paymentAllocation.update({ where: { id: asignacion.id }, data: { amount: '1' } })).rejects.toThrow()
    await as(app, admin).post(`${pagos()}/${pago.id}/void`, { reason: 'Prueba' }).expect(200)
    await expect(db.payment.update({ where: { id: pago.id }, data: { voidReason: 'Cambio' } })).rejects.toThrow()
  })

  it('pagos simultaneos no asignan de mas una misma prestacion', async () => {
    const id = await registrar(consulta)
    const respuestas = await Promise.all(
      Array.from({ length: 6 }, () => as(app, recepcion).post(pagos(), { amount: '3000', method: 'CASH' })),
    )
    expect(respuestas.every((r) => r.status === 201)).toBe(true)
    const final = await leerCuenta()
    expect(final.services.find((s) => s.id === id)).toMatchObject({ paid: '10000.00', pending: '0.00' })
    expect(final.balance).toBe('-8000.00')
    const asignado = await db.paymentAllocation.aggregate({ _sum: { amount: true } })
    expect(asignado._sum.amount?.toFixed(2)).toBe('10000.00')
  })

  it('audita servicios y pagos con importes pero sin datos clinicos', async () => {
    const servicio = await registrar(consulta)
    const pago = (await as(app, recepcion).post(pagos(), { amount: '1000', method: 'CASH' })).body as { id: string }
    await as(app, admin).post(`${pagos()}/${pago.id}/void`, { reason: 'Prueba' }).expect(200)
    await as(app, admin).post(`${servicios()}/${servicio}/void`, { reason: 'Prueba' }).expect(200)
    const acciones = (await db.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((a) => a.action)
    expect(acciones).toEqual(
      expect.arrayContaining(['SERVICE_RECORDED', 'PAYMENT_RECORDED', 'PAYMENT_VOIDED', 'SERVICE_VOIDED']),
    )
  })
})

describe('acceso a la cuenta', () => {
  it('el odontologo ve las prestaciones pero no la cuenta ni los pagos', async () => {
    await registrar(consulta)
    expect((await as(app, odontologo).get(servicios())).status).toBe(200)
    expect((await as(app, odontologo).get(cuenta())).status).toBe(403)
    expect((await as(app, odontologo).post(pagos(), { amount: '100', method: 'CASH' })).status).toBe(403)
    expect((await as(app, odontologo).get('/api/debtors')).status).toBe(403)
  })

  it('recepcion y administracion ven la cuenta', async () => {
    for (const cliente of [recepcion, admin]) expect((await as(app, cliente).get(cuenta())).status).toBe(200)
  })

  it('un paciente inexistente da 404', async () => {
    const fantasma = '00000000-0000-7000-8000-000000000000'
    expect((await as(app, recepcion).get(cuenta(fantasma))).status).toBe(404)
    expect((await as(app, recepcion).post(pagos(fantasma), { amount: '100', method: 'CASH' })).status).toBe(404)
  })
})

describe('saldos pendientes', () => {
  it('lista solo a quienes deben, de mayor a menor deuda', async () => {
    const otro = await seedPatient(db, seed, { firstName: 'Ana', lastName: 'Zapata' })
    const alDia = await seedPatient(db, seed, { firstName: 'Beto', lastName: 'Alvarez' })
    await registrar(consulta)
    const registrarA = async (id: string, practica: { id: string }) =>
      as(app, odontologo).post(servicios(id), { practiceId: practica.id }).expect(201)
    await registrarA(otro.id, limpieza)
    await registrarA(alDia.id, consulta)
    await as(app, recepcion).post(pagos(alDia.id), { amount: '10000', method: 'CASH' }).expect(201)

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
