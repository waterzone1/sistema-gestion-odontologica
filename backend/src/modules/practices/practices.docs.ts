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
  createPracticeSchema,
  listPracticesQuerySchema,
  practiceIdParamsSchema,
  practiceSchema,
  updatePracticeSchema,
} from './practices.schemas.js'

export function registerPracticesDocs(registry: OpenAPIRegistry): void {
  const tags = ['Prácticas']
  const common = { 401: unauthenticated, 403: forbidden }
  const bodyOf = (schema: z.ZodType) => ({ body: { content: { 'application/json': { schema } } } })

  registry.registerPath({
    method: 'get',
    path: '/api/practices',
    tags,
    summary: 'Lista el catálogo de prácticas',
    security: readSecurity,
    request: { query: listPracticesQuerySchema },
    responses: { 200: json(z.array(practiceSchema), 'Prácticas'), 400: invalidInput, ...common },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/practices',
    tags,
    summary: 'Crea una práctica',
    description: 'El código es único por organización y se guarda en mayúsculas.',
    security: writeSecurity,
    request: bodyOf(createPracticeSchema),
    responses: {
      201: json(practiceSchema, 'Práctica creada'),
      400: invalidInput,
      409: errorResponse('Ya existe una práctica con ese código'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/practices/{id}',
    tags,
    summary: 'Edita o desactiva una práctica',
    description:
      'Las prácticas no se borran: se desactivan. Cambiar el precio no modifica las prestaciones ya registradas.',
    security: writeSecurity,
    request: { params: practiceIdParamsSchema, ...bodyOf(updatePracticeSchema) },
    responses: {
      200: json(practiceSchema, 'Práctica actualizada'),
      400: invalidInput,
      404: notFound,
      409: errorResponse('Ya existe una práctica con ese código'),
      ...common,
    },
  })
}
