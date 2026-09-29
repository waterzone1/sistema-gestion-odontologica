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
  branchIdParamsSchema,
  branchSchema,
  createBranchSchema,
  updateBranchSchema,
} from './branches.schemas.js'

export function registerBranchesDocs(registry: OpenAPIRegistry): void {
  const tags = ['Sedes']
  const common = { 401: unauthenticated, 403: forbidden }
  const bodyOf = (schema: z.ZodType) => ({ body: { content: { 'application/json': { schema } } } })

  registry.registerPath({
    method: 'get',
    path: '/api/branches',
    tags,
    summary: 'Lista las sedes de la organización',
    description: 'Disponible para cualquier usuario autenticado.',
    security: readSecurity,
    responses: { 200: json(z.array(branchSchema), 'Sedes'), 401: unauthenticated },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/branches',
    tags,
    summary: 'Crea una sede',
    security: writeSecurity,
    request: bodyOf(createBranchSchema),
    responses: { 201: json(branchSchema, 'Sede creada'), 400: invalidInput, ...common },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/branches/{id}',
    tags,
    summary: 'Edita o desactiva una sede',
    description: 'No se puede desactivar la única sede activa.',
    security: writeSecurity,
    request: { params: branchIdParamsSchema, ...bodyOf(updateBranchSchema) },
    responses: {
      200: json(branchSchema, 'Sede actualizada'),
      400: invalidInput,
      404: notFound,
      409: errorResponse('Es la única sede activa'),
      ...common,
    },
  })
}
