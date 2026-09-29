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
  professionalParamsSchema,
  professionalSchema,
  saveProfessionalSchema,
} from './professionals.service.js'

export function registerProfessionalsDocs(registry: OpenAPIRegistry): void {
  const tags = ['Profesionales']
  const common = { 401: unauthenticated, 403: forbidden }

  registry.registerPath({
    method: 'get',
    path: '/api/professionals',
    tags,
    summary: 'Lista los perfiles profesionales',
    security: readSecurity,
    responses: { 200: json(z.array(professionalSchema), 'Profesionales'), ...common },
  })

  registry.registerPath({
    method: 'put',
    path: '/api/professionals/{userId}',
    tags,
    summary: 'Crea o actualiza el perfil profesional de un usuario con rol Odontólogo',
    security: writeSecurity,
    request: {
      params: professionalParamsSchema,
      body: { content: { 'application/json': { schema: saveProfessionalSchema } } },
    },
    responses: {
      200: json(professionalSchema, 'Perfil guardado'),
      400: invalidInput,
      404: notFound,
      422: errorResponse('El usuario no tiene rol Odontólogo'),
      ...common,
    },
  })
}
