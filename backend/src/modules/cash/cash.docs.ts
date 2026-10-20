import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import {
  errorResponse,
  forbidden,
  invalidInput,
  json,
  readSecurity,
  unauthenticated,
  writeSecurity,
} from '../../openapi/common.js'
import { cashDaySchema, cashQuerySchema, exchangeRatesSchema, setExchangeRateSchema } from './cash.schemas.js'

export function registerCashDocs(registry: OpenAPIRegistry): void {
  const tags = ['Caja y cotización']
  const common = { 401: unauthenticated, 403: forbidden }

  registry.registerPath({
    method: 'get',
    path: '/api/exchange-rates',
    tags,
    summary: 'Cotización del dólar vigente e historial',
    security: readSecurity,
    responses: { 200: json(exchangeRatesSchema, 'Cotización vigente y últimos cambios'), ...common },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/exchange-rates',
    tags,
    summary: 'Carga una nueva cotización del dólar',
    description:
      'Queda como vigente para los cobros en dólares. Los cambios no se editan ni se borran: se agrega uno nuevo y queda auditado.',
    security: writeSecurity,
    request: { body: { content: { 'application/json': { schema: setExchangeRateSchema } } } },
    responses: { 201: json(exchangeRatesSchema, 'Cotización actualizada'), 400: invalidInput, ...common },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/cash',
    tags,
    summary: 'Caja del día',
    description:
      'Cobros del día con su moneda, cotización y equivalente en pesos; las anulaciones se listan pero no suman. El uso de saldo a favor se informa aparte.',
    security: readSecurity,
    request: { query: cashQuerySchema },
    responses: {
      200: json(cashDaySchema, 'Movimientos y totales del día'),
      400: invalidInput,
      422: errorResponse('La fecha es futura'),
      ...common,
    },
  })
}
