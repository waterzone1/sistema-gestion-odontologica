import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { errorBodySchema } from '../../shared/errors.js'
import { healthResponseSchema } from './health.schemas.js'

export function registerHealthDocs(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/api/health',
    tags: ['Health'],
    summary: 'Estado del servicio y de la base de datos',
    responses: {
      200: {
        description: 'Servicio y base de datos operativos',
        content: { 'application/json': { schema: healthResponseSchema } },
      },
      503: {
        description: 'El servicio responde pero la base de datos no',
        content: { 'application/json': { schema: healthResponseSchema } },
      },
      500: {
        description: 'Error inesperado',
        content: { 'application/json': { schema: errorBodySchema } },
      },
    },
  })
}
