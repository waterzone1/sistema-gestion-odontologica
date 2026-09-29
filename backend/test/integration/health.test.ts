import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { createDb } from '../../src/shared/db.js'
import { silentLogger } from '../helpers.js'

const databaseUrl = process.env['DATABASE_URL']
if (!databaseUrl) throw new Error('los tests de integracion necesitan DATABASE_URL')

const dbReal = createDb(databaseUrl)
const dbCaida = createDb('postgresql://nadie:nada@127.0.0.1:1/nada')

afterAll(async () => {
  await dbReal.$disconnect()
  await dbCaida.$disconnect()
})

describe('GET /api/health', () => {
  it('responde 200 con la base operativa', async () => {
    const res = await request(createApp({ db: dbReal, logger: silentLogger })).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' })
  })

  it('responde 503 si la base no responde', async () => {
    const res = await request(createApp({ db: dbCaida, logger: silentLogger })).get('/api/health')
    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ status: 'degraded', db: 'down' })
  })
})

describe('documentacion', () => {
  it('sirve el openapi en json', async () => {
    const res = await request(createApp({ db: dbReal, logger: silentLogger })).get('/api/openapi.json')
    expect(res.status).toBe(200)
    expect((res.body as { openapi: string }).openapi).toBe('3.1.0')
  })
})
