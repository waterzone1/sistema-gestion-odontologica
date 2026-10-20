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
let recepcion: Client
let odontologo: Client
let pacienteId: string
let perfilId: string
let implante: { id: string }

interface Cuenta {
  balance: string
  payments: { currency: string; originalAmount: string; exchangeRate: string; amount: string }[]
}
interface Caja {
  date: string
  movements: { kind: string; currency: string; originalAmount: string; amount: string; status: string }[]
  totals: { method: string; currency: string; count: number; originalTotal: string; amountTotal: string }[]
  byCurrency: { currency: string; originalTotal: string; amountTotal: string }[]
  totalArs: string
  creditTotal: string
  voidedCount: number
}

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const cotizar = (rate: string, cliente: Client = recepcion) => as(app, cliente).post('/api/exchange-rates', { rate })
const cobrar = (lines: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  as(app, recepcion).post(`/api/patients/${pacienteId}/payments`, { lines, ...extra })
const cuenta = async () => (await as(app, recepcion).get(`/api/patients/${pacienteId}/account`).expect(200)).body as Cuenta
const caja = async (query = '') => (await as(app, recepcion).get(`/api/cash${query}`).expect(200)).body as Caja

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'], displayName: 'Rocío' })
  perfilId = (await seedProfessional(db, seed, { username: 'odontologo' })).profile.id
  pacienteId = (await seedPatient(db, seed, { firstName: 'Luca', lastName: 'Rossi' })).id
  implante = await seedPractice(db, seed, { code: 'IMP', name: 'Implante', basePrice: '1000000.00' })
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
  await as(app, recepcion)
    .post(`/api/patients/${pacienteId}/services`, { practiceId: implante.id, professionalId: perfilId })
    .expect(201)
})

describe('cotizacion del dolar', () => {
  it('recepcion la carga, queda el historial y el odontologo no puede', async () => {
    expect((await as(app, recepcion).get('/api/exchange-rates').expect(200)).body).toEqual({ current: null, history: [] })
    await cotizar('1200').expect(201)
    const res = await cotizar('1250.5').expect(201)
    expect(res.body).toMatchObject({
      current: { currency: 'USD', rate: '1250.50', setBy: 'Rocío' },
      history: [{ rate: '1250.50' }, { rate: '1200.00' }],
    })
    expect((await cotizar('1300', odontologo)).status).toBe(403)
    expect((await as(app, odontologo).get('/api/exchange-rates')).status).toBe(403)
    await cotizar('0').expect(400)
    await cotizar('999999999').expect(400)
    expect(await db.auditLog.count({ where: { action: 'EXCHANGE_RATE_SET' } })).toBe(2)
  })

  it('la base no deja cambiar ni borrar una cotizacion', async () => {
    await cotizar('1200').expect(201)
    const fila = await db.exchangeRate.findFirstOrThrow()
    await expect(db.exchangeRate.update({ where: { id: fila.id }, data: { rate: '1' } })).rejects.toThrow()
    await expect(db.exchangeRate.delete({ where: { id: fila.id } })).rejects.toThrow()
  })
})

describe('cobros en dolares', () => {
  it('guarda la moneda y la cotizacion, y descuenta la deuda en pesos', async () => {
    await cotizar('1250.50').expect(201)
    const res = await cobrar(
      [
        { amount: '100', currency: 'USD', method: 'CASH' },
        { amount: '20000', method: 'TRANSFER' },
      ],
      { exchangeRate: '1250.50' },
    )
    expect(res.status).toBe(201)
    const { payments, balance } = await cuenta()
    expect(payments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: 'USD', originalAmount: '100.00', exchangeRate: '1250.50', amount: '125050.00' }),
        expect.objectContaining({ currency: 'ARS', originalAmount: '20000.00', exchangeRate: '1.00', amount: '20000.00' }),
      ]),
    )
    expect(balance).toBe('854950.00')
  })

  it('la cotizacion de un pago queda fija aunque cambie despues', async () => {
    await cotizar('1000').expect(201)
    await cobrar([{ amount: '10', currency: 'USD', method: 'CASH' }], { exchangeRate: '1000' }).expect(201)
    await cotizar('2000').expect(201)
    const { payments, balance } = await cuenta()
    expect(payments[0]).toMatchObject({ exchangeRate: '1000.00', amount: '10000.00' })
    expect(balance).toBe('990000.00')
  })

  it('rechaza si la cotizacion cambio, si falta o si nunca se cargo', async () => {
    const sinCargar = await cobrar([{ amount: '10', currency: 'USD', method: 'CASH' }], { exchangeRate: '1000' })
    expect([sinCargar.status, codigo(sinCargar)]).toEqual([422, 'NO_EXCHANGE_RATE'])
    await cotizar('1100').expect(201)
    const vieja = await cobrar([{ amount: '10', currency: 'USD', method: 'CASH' }], { exchangeRate: '1000' })
    expect([vieja.status, codigo(vieja)]).toEqual([409, 'EXCHANGE_RATE_CHANGED'])
    expect((vieja.body as { error: { details: { rate: string } } }).error.details.rate).toBe('1100.00')
    const falta = await cobrar([{ amount: '10', currency: 'USD', method: 'CASH' }])
    expect(falta.status).toBe(400)
    expect(await db.payment.count()).toBe(0)
  })

  it('la base rechaza un equivalente en pesos que no cierra con la cotizacion', async () => {
    const base = {
      organizationId: seed.organizationId,
      patientId: pacienteId,
      method: 'CASH' as const,
      receivedAt: new Date(),
      createdById: (await db.user.findFirstOrThrow({ where: { username: 'recepcion' } })).id,
    }
    await expect(
      db.payment.create({ data: { ...base, currency: 'USD', originalAmount: '10', exchangeRate: '1000', amount: '9000' } }),
    ).rejects.toThrow()
    await expect(
      db.payment.create({ data: { ...base, currency: 'ARS', originalAmount: '10', exchangeRate: '2', amount: '20' } }),
    ).rejects.toThrow()
  })
})

describe('caja del dia', () => {
  it('suma por medio y moneda, lista anulados aparte y el saldo a favor no suma', async () => {
    await cotizar('1000').expect(201)
    await cobrar(
      [
        { amount: '100', currency: 'USD', method: 'CASH' },
        { amount: '50', currency: 'USD', method: 'CASH' },
        { amount: '30000', method: 'CASH' },
        { amount: '20000', method: 'TRANSFER' },
      ],
      { exchangeRate: '1000' },
    ).expect(201)
    const anulable = (await cobrar([{ amount: '5000', method: 'CARD' }]).expect(201)).body as { payments: { id: string }[] }
    await as(app, recepcion)
      .post(`/api/patients/${pacienteId}/payments/${anulable.payments[0]?.id}/void`, { reason: 'Error de carga' })
      .expect(200)
    await cobrar([{ amount: '900000', method: 'TRANSFER' }]).expect(201)
    const otraPractica = await seedPractice(db, seed, { basePrice: '10000.00' })
    await as(app, recepcion)
      .post(`/api/patients/${pacienteId}/services`, { practiceId: otraPractica.id, professionalId: perfilId })
      .expect(201)
    await cobrar([], { credit: '10000' }).expect(201)

    const hoy = await caja()
    expect(hoy.totals).toEqual(
      expect.arrayContaining([
        { method: 'CASH', currency: 'USD', count: 2, originalTotal: '150.00', amountTotal: '150000.00' },
        { method: 'CASH', currency: 'ARS', count: 1, originalTotal: '30000.00', amountTotal: '30000.00' },
        { method: 'TRANSFER', currency: 'ARS', count: 2, originalTotal: '920000.00', amountTotal: '920000.00' },
      ]),
    )
    expect(hoy.totals).toHaveLength(3)
    expect(hoy.byCurrency).toEqual(
      expect.arrayContaining([
        { currency: 'USD', originalTotal: '150.00', amountTotal: '150000.00' },
        { currency: 'ARS', originalTotal: '950000.00', amountTotal: '950000.00' },
      ]),
    )
    expect(hoy.totalArs).toBe('1100000.00')
    expect(hoy.creditTotal).toBe('10000.00')
    expect(hoy.voidedCount).toBe(1)
    expect(hoy.movements.filter((m) => m.kind === 'CREDIT')).toHaveLength(1)
  })

  it('muestra otros dias y no deja pedir uno futuro', async () => {
    await cobrar([{ amount: '1000', method: 'CASH' }], { receivedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }).expect(201)
    const hoy = await caja()
    expect(hoy.movements).toHaveLength(0)
    const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
      new Date(Date.now() - 3 * 86_400_000),
    )
    const antes = await caja(`?date=${fecha}`)
    expect(antes.date).toBe(fecha)
    expect(antes.totalArs).toBe('1000.00')
    const futura = await as(app, recepcion).get('/api/cash?date=2999-01-01')
    expect(codigo(futura)).toBe('FUTURE_DATE')
    expect((await as(app, odontologo).get('/api/cash')).status).toBe(403)
  })
})
