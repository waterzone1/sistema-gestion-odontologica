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
  clinicalEntryParamsSchema,
  clinicalEntrySchema,
  clinicalPatientParamsSchema,
  correctClinicalEntrySchema,
  createClinicalEntrySchema,
} from './clinical.schemas.js'

export function registerClinicalDocs(registry: OpenAPIRegistry): void {
  const tags = ['Historia clínica']
  const common = { 401: unauthenticated, 403: forbidden }
  const bodyOf = (schema: z.ZodType) => ({ body: { content: { 'application/json': { schema } } } })

  registry.registerPath({
    method: 'get',
    path: '/api/patients/{patientId}/clinical',
    tags,
    summary: 'Historia clínica del paciente',
    description:
      'Solo los odontólogos acceden. Administración y recepción reciben 403. Cada apertura de la historia queda registrada en la auditoría.',
    security: readSecurity,
    request: { params: clinicalPatientParamsSchema },
    responses: {
      200: json(z.array(clinicalEntrySchema), 'Notas, de la más reciente a la más antigua'),
      404: notFound,
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{patientId}/clinical',
    tags,
    summary: 'Registra una nota de evolución',
    description: 'La nota queda a nombre del odontólogo y no se puede editar ni borrar: se corrige agregando una corrección.',
    security: writeSecurity,
    request: { params: clinicalPatientParamsSchema, ...bodyOf(createClinicalEntrySchema) },
    responses: {
      201: json(clinicalEntrySchema, 'Nota registrada'),
      400: invalidInput,
      404: notFound,
      422: errorResponse('Paciente archivado, usuario sin perfil profesional o turno que no corresponde'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{patientId}/clinical/{entryId}/corrections',
    tags,
    summary: 'Agrega una corrección a una nota',
    description: 'La nota original se conserva intacta; la corrección queda vinculada a ella.',
    security: writeSecurity,
    request: { params: clinicalEntryParamsSchema, ...bodyOf(correctClinicalEntrySchema) },
    responses: {
      201: json(clinicalEntrySchema, 'Adenda registrada'),
      400: invalidInput,
      404: notFound,
      422: errorResponse('Paciente archivado, sin perfil profesional, o la nota ya es una corrección'),
      ...common,
    },
  })
}
