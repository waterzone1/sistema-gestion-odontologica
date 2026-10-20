import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
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
import { odontogramParamsSchema, odontogramSchema, recordFindingSchema } from './odontogram.schemas.js'

export function registerOdontogramDocs(registry: OpenAPIRegistry): void {
  const tags = ['Odontograma']
  const common = { 401: unauthenticated, 403: forbidden }

  registry.registerPath({
    method: 'get',
    path: '/api/patients/{patientId}/odontogram',
    tags,
    summary: 'Odontograma del paciente: condición actual e historial',
    description: 'Solo odontólogos. La condición actual se deriva de los registros; nunca se pisa el historial.',
    security: readSecurity,
    request: { params: odontogramParamsSchema },
    responses: { 200: json(odontogramSchema, 'Odontograma'), 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{patientId}/odontogram/findings',
    tags,
    summary: 'Registra la condición de una pieza o de sus superficies',
    description:
      'Corona, endodoncia, implante, ausente, extracción indicada y prótesis se registran sobre la pieza completa. Marcar sano limpia la pieza o la superficie. Los registros no se modifican ni se borran.',
    security: writeSecurity,
    request: { params: odontogramParamsSchema, body: { content: { 'application/json': { schema: recordFindingSchema } } } },
    responses: {
      201: json(odontogramSchema, 'Odontograma actualizado'),
      400: invalidInput,
      404: notFound,
      422: errorResponse('Pieza o superficie inválida, paciente archivado o usuario sin perfil profesional'),
      ...common,
    },
  })
}
