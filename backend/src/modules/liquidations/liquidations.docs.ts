import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import {
  errorResponse,
  forbidden,
  invalidInput,
  json,
  notFound,
  readSecurity,
  unauthenticated,
  writeSecurity,
} from '../../openapi/common.js'
import {
  cancelLiquidationSchema,
  createLiquidationSchema,
  liquidationItemParamsSchema,
  liquidationParamsSchema,
  liquidationSchema,
  liquidationSummarySchema,
  payLiquidationSchema,
  resolveItemSchema,
} from './liquidations.schemas.js'

export function registerLiquidationsDocs(registry: OpenAPIRegistry): void {
  const tags = ['Liquidaciones']
  const common = { 401: unauthenticated, 403: forbidden }
  const bodyOf = (schema: z.ZodType) => ({ body: { content: { 'application/json': { schema } } } })
  const status = { 409: errorResponse('La liquidación no está en el estado necesario') }

  registry.registerPath({
    method: 'get',
    path: '/api/liquidations',
    tags,
    summary: 'Liquidaciones a coberturas, de la más reciente a la más antigua',
    security: readSecurity,
    responses: { 200: json(z.array(liquidationSummarySchema), 'Liquidaciones'), ...common },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/liquidations',
    tags,
    summary: 'Arma una liquidación con las prestaciones cubiertas del período',
    description:
      'Incluye las prestaciones vigentes con importe a cargo de la cobertura que todavía no están en otra liquidación activa. Las rechazadas vuelven a poder liquidarse.',
    security: writeSecurity,
    request: bodyOf(createLiquidationSchema),
    responses: {
      201: json(liquidationSchema, 'Liquidación en borrador'),
      400: invalidInput,
      409: errorResponse('Otra liquidación tomó alguna prestación'),
      422: errorResponse('No hay prestaciones para liquidar'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/liquidations/{id}',
    tags,
    summary: 'Detalle de la liquidación con sus prestaciones',
    security: readSecurity,
    request: { params: liquidationParamsSchema },
    responses: { 200: json(liquidationSchema, 'Liquidación'), 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/liquidations/{id}/export',
    tags,
    summary: 'Exporta la liquidación en CSV (separado por punto y coma)',
    security: readSecurity,
    request: { params: liquidationParamsSchema },
    responses: { 200: { description: 'Archivo CSV', content: { 'text/csv': { schema: z.string() } } }, 404: notFound, ...common },
  })

  const action = (path: string, summary: string, request: object, extra = {}) =>
    registry.registerPath({
      method: 'post',
      path,
      tags,
      summary,
      security: writeSecurity,
      request,
      responses: { 200: json(liquidationSchema, 'Liquidación actualizada'), 400: invalidInput, 404: notFound, ...status, ...extra, ...common },
    })

  action('/api/liquidations/{id}/submit', 'Marca la liquidación como presentada', { params: liquidationParamsSchema })
  action(
    '/api/liquidations/{id}/items/{itemId}/result',
    'Registra si la cobertura aprobó, debitó o rechazó una prestación',
    { params: liquidationItemParamsSchema, ...bodyOf(resolveItemSchema) },
    { 422: errorResponse('El débito no es menor a lo reclamado') },
  )
  action(
    '/api/liquidations/{id}/payment',
    'Registra el pago de la cobertura',
    { params: liquidationParamsSchema, ...bodyOf(payLiquidationSchema) },
    { 422: errorResponse('Falta el resultado de alguna prestación') },
  )
  action(
    '/api/liquidations/{id}/cancel',
    'Anula la liquidación y libera sus prestaciones',
    { params: liquidationParamsSchema, ...bodyOf(cancelLiquidationSchema) },
    { 422: errorResponse('Ya tiene resultados registrados') },
  )
}
