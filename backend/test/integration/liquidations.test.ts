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
let perfilId: string
let proveedorId: string
let planId: string
let consulta: { id: string }

interface Liquidacion {
  id: string
  status: string
  totals: { items: number; pending: number; claimed: string; approved: string; rejected: string; debited: string }
  items: { id: string; status: string; claimedAmount: string; service: { id: string; affiliateNumber: string } }[]
}

const codigo = (res: request.Response) => (res.body as { error: { code: string } }).error.code
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
const crear = () => as(app, recepcion).post('/api/liquidations', { providerId: proveedorId, periodFrom: '2026-01-01', periodTo: hoy() })

async function pacienteCubierto(documentNumber: string) {
  const paciente = await seedPatient(db, seed, { documentNumber })
  await as(app, recepcion)
    .post(`/api/patients/${paciente.id}/coverages`, { planId, affiliateNumber: `AF-${documentNumber}`, validFrom: '2026-01-01' })
    .expect(201)
  await as(app, recepcion)
    .post(`/api/patients/${paciente.id}/services`, { practiceId: consulta.id, professionalId: perfilId })
    .expect(201)
  return paciente.id
}

beforeEach(async () => {
  await resetDb(db)
  seed = await seedInstall(db)
  await seedUser(db, seed, { username: 'recepcion', roles: ['RECEPTIONIST'] })
  perfilId = (await seedProfessional(db, seed, { username: 'odontologo' })).profile.id
  consulta = await seedPractice(db, seed, { code: 'CON', name: 'Consulta', basePrice: '10000.00' })
  recepcion = await loginAs(app, 'recepcion')
  odontologo = await loginAs(app, 'odontologo')
  const proveedor = (await as(app, recepcion).post('/api/coverages/providers', { name: 'IOMA', kind: 'OBRA_SOCIAL' })).body as {
    id: string
  }
  proveedorId = proveedor.id
  const conPlan = (await as(app, recepcion).post(`/api/coverages/providers/${proveedorId}/plans`, { name: 'General' })).body as {
    plans: { id: string }[]
  }
  planId = conPlan.plans[0]?.id ?? ''
  await as(app, recepcion)
    .post(`/api/coverages/plans/${planId}/agreements`, {
      validFrom: '2026-01-01',
      items: [{ practiceId: consulta.id, insurerAmount: '7000', patientCopay: '3000' }],
    })
    .expect(201)
})

describe('liquidaciones', () => {
  it('agrupa las prestaciones cubiertas del periodo y no las toma dos veces', async () => {
    await pacienteCubierto('30111222')
    await pacienteCubierto('30111333')
    const res = await crear().expect(201)
    const liquidacion = res.body as Liquidacion
    expect(liquidacion).toMatchObject({ status: 'DRAFT', totals: { items: 2, pending: 2, claimed: '14000.00' } })
    const otra = await crear()
    expect([otra.status, codigo(otra)]).toEqual([422, 'EMPTY_LIQUIDATION'])
    expect((await as(app, odontologo).get('/api/liquidations')).status).toBe(403)
  })

  it('presentada, registra aprobacion, debito y rechazo, y el pago cierra', async () => {
    await pacienteCubierto('30111222')
    await pacienteCubierto('30111333')
    await pacienteCubierto('30111444')
    const { id, items } = (await crear().expect(201)).body as Liquidacion
    const [a, b, c] = items
    const ruta = (itemId = '') => `/api/liquidations/${id}/items/${itemId}/result`
    const antes = await as(app, recepcion).post(ruta(a?.id), { status: 'APPROVED' })
    expect(codigo(antes)).toBe('INVALID_LIQUIDATION_STATUS')
    await as(app, recepcion).post(`/api/liquidations/${id}/submit`).expect(200)

    await as(app, recepcion).post(ruta(a?.id), { status: 'APPROVED' }).expect(200)
    const debitoMal = await as(app, recepcion).post(ruta(b?.id), { status: 'DEBITED', approvedAmount: '7000', reason: 'Débito' })
    expect(codigo(debitoMal)).toBe('INVALID_DEBIT')
    await as(app, recepcion).post(ruta(b?.id), { status: 'DEBITED', approvedAmount: '5000', reason: 'Falta firma' }).expect(200)
    const sinPago = await as(app, recepcion).post(`/api/liquidations/${id}/payment`, { amount: '12000' })
    expect(codigo(sinPago)).toBe('ITEMS_PENDING')
    const final = (await as(app, recepcion).post(ruta(c?.id), { status: 'REJECTED', reason: 'Sin autorización' }).expect(200))
      .body as Liquidacion
    expect(final.totals).toMatchObject({ pending: 0, approved: '12000.00', debited: '2000.00', rejected: '7000.00' })

    const pagada = (await as(app, recepcion).post(`/api/liquidations/${id}/payment`, { amount: '12000', reference: 'TR-1' }).expect(200))
      .body as Liquidacion & { paidAmount: string }
    expect(pagada).toMatchObject({ status: 'PAID', paidAmount: '12000.00' })

    const nueva = (await crear().expect(201)).body as Liquidacion
    expect(nueva.items.map((i) => i.service.id)).toEqual([c?.service.id])
  })

  it('anular libera las prestaciones; una prestacion liquidada no se anula', async () => {
    await pacienteCubierto('30111222')
    const { id, items } = (await crear().expect(201)).body as Liquidacion
    const servicio = items[0]?.service.id ?? ''
    const paciente = await db.performedService.findUniqueOrThrow({ where: { id: servicio } })
    const anularPrestacion = await as(app, recepcion)
      .post(`/api/patients/${paciente.patientId}/services/${servicio}/void`, { reason: 'Error de carga' })
    expect(codigo(anularPrestacion)).toBe('IN_LIQUIDATION')

    await as(app, recepcion).post(`/api/liquidations/${id}/cancel`, { reason: 'Período equivocado' }).expect(200)
    await crear().expect(201)
    await expect(db.liquidation.delete({ where: { id } })).rejects.toThrow()
  })

  it('exporta un CSV con las prestaciones', async () => {
    await pacienteCubierto('30111222')
    const { id } = (await crear().expect(201)).body as Liquidacion
    const res = await as(app, recepcion).get(`/api/liquidations/${id}/export`).expect(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toContain('liquidacion-ioma-')
    const lineas = res.text.replace('﻿', '').trim().split('\r\n')
    expect(lineas[0]).toBe('Fecha;Paciente;Documento;Plan;Afiliado;Código;Práctica;Autorización;Reclamado;Estado;Aprobado;Motivo')
    expect(lineas[1]).toContain(';30111222;General;AF-30111222;CON;Consulta;;7000,00;Pendiente;;')
  })
})
