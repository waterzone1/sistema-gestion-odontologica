import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import type { z } from 'zod'
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
  archivePatientSchema,
  createPatientSchema,
  listPatientsQuerySchema,
  patientIdParamsSchema,
  patientListSchema,
  patientSchema,
  updatePatientSchema,
} from './patients.schemas.js'

export function registerPatientsDocs(registry: OpenAPIRegistry): void {
  const tags = ['Pacientes']
  const common = { 401: unauthenticated, 403: forbidden }
  const bodyOf = (schema: z.ZodType) => ({ body: { content: { 'application/json': { schema } } } })
  const params = { params: patientIdParamsSchema }

  registry.registerPath({
    method: 'get',
    path: '/api/patients',
    tags,
    summary: 'Busca y lista pacientes',
    description:
      'La búsqueda q ignora tildes y mayúsculas y acepta varias palabras (apellido, nombre, documento o teléfono). Excluye archivados salvo que se pida otro estado.',
    security: readSecurity,
    request: { query: listPatientsQuerySchema },
    responses: {
      200: json(patientListSchema, 'Pacientes de la página pedida'),
      400: invalidInput,
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients',
    tags,
    summary: 'Da de alta un paciente',
    security: writeSecurity,
    request: bodyOf(createPatientSchema),
    responses: {
      201: json(patientSchema, 'Paciente creado'),
      400: invalidInput,
      409: errorResponse('Ya existe un paciente con ese documento'),
      422: errorResponse('El documento no tiene un formato válido'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/patients/{id}',
    tags,
    summary: 'Datos administrativos de un paciente',
    security: readSecurity,
    request: params,
    responses: { 200: json(patientSchema, 'Paciente'), 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/patients/{id}',
    tags,
    summary: 'Edita los datos administrativos de un paciente',
    security: writeSecurity,
    request: { ...params, ...bodyOf(updatePatientSchema) },
    responses: {
      200: json(patientSchema, 'Paciente actualizado'),
      400: invalidInput,
      404: notFound,
      409: errorResponse('Ya existe otro paciente con ese documento'),
      422: errorResponse('El documento no tiene un formato válido'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{id}/archive',
    tags,
    summary: 'Archiva un paciente (no se borra)',
    description:
      'Si tiene turnos pendientes o confirmados por venir responde 409 con la lista; con cancelActiveAppointments los cancela con el motivo "Paciente archivado".',
    security: writeSecurity,
    request: { ...params, ...bodyOf(archivePatientSchema) },
    responses: {
      200: json(patientSchema, 'Paciente'),
      404: notFound,
      409: errorResponse('El paciente tiene turnos pendientes'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{id}/unarchive',
    tags,
    summary: 'Reactiva un paciente archivado',
    security: writeSecurity,
    request: params,
    responses: { 200: json(patientSchema, 'Paciente'), 404: notFound, ...common },
  })
}
