import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import type { Db } from '../../src/shared/db.js'
import { silentLogger } from '../helpers.js'

// estas rutas no tocan la base, alcanza con un stub
const app = createApp({ db: {} as unknown as Db, logger: silentLogger })

describe('formato de errores', () => {
  it('devuelve 404 con el formato estandar', async () => {
    const res = await request(app).get('/api/no-existe')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'El recurso no existe', details: {} },
    })
  })

  it('devuelve 400 ante un json roto', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"roto":')
    expect(res.status).toBe(400)
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_JSON')
  })

  it('devuelve 413 si el cuerpo supera el limite', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ relleno: 'x'.repeat(200_000) }))
    expect(res.status).toBe(413)
    expect((res.body as { error: { code: string } }).error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('agrega un X-Request-Id generado por el servidor', async () => {
    const res = await request(app).get('/api/no-existe').set('X-Request-Id', 'inyectado')
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('no expone el header x-powered-by', async () => {
    const res = await request(app).get('/api/no-existe')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})
