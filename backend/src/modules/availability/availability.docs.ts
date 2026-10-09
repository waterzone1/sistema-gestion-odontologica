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
  agendaAvailabilityQuerySchema,
  agendaAvailabilitySchema,
  createExceptionSchema,
  exceptionParamsSchema,
  exceptionResultSchema,
  professionalAvailabilityParamsSchema,
  professionalAvailabilitySchema,
  replaceRulesSchema,
} from './availability.schemas.js'

export function registerAvailabilityDocs(registry: OpenAPIRegistry): void {
  const tags = ['Disponibilidad']
  const common = { 401: unauthenticated, 403: forbidden }
  const bodyOf = (schema: z.ZodType) => ({ body: { content: { 'application/json': { schema } } } })
  const params = { params: professionalAvailabilityParamsSchema }

  registry.registerPath({
    method: 'get',
    path: '/api/professionals/{professionalId}/availability',
    tags,
    summary: 'Horario semanal y excepciones vigentes de un profesional',
    security: readSecurity,
    request: params,
    responses: { 200: json(professionalAvailabilitySchema, 'Disponibilidad'), 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'put',
    path: '/api/professionals/{professionalId}/availability/rules',
    tags,
    summary: 'Reemplaza el horario semanal',
    description:
      'Solo administración. Las franjas son por sede y en la hora del consultorio; no pueden superponerse el mismo día aunque sean de sedes distintas.',
    security: writeSecurity,
    request: { ...params, ...bodyOf(replaceRulesSchema) },
    responses: {
      200: json(professionalAvailabilitySchema, 'Disponibilidad actualizada'),
      400: invalidInput,
      404: notFound,
      422: errorResponse('Franjas inválidas o sede donde el profesional no trabaja'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/professionals/{professionalId}/exceptions',
    tags,
    summary: 'Registra un bloqueo, vacaciones, ausencia u horario extraordinario',
    description:
      'Administración y recepción. Devuelve los turnos activos que quedan dentro del período para reprogramarlos; no los cancela.',
    security: writeSecurity,
    request: { ...params, ...bodyOf(createExceptionSchema) },
    responses: {
      201: json(exceptionResultSchema, 'Excepción registrada'),
      400: invalidInput,
      404: notFound,
      422: errorResponse('Sede donde el profesional no trabaja'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/professionals/{professionalId}/exceptions/{exceptionId}/revoke',
    tags,
    summary: 'Deja sin efecto una excepción',
    description: 'La excepción no se borra: queda registrada como revocada.',
    security: writeSecurity,
    request: { params: exceptionParamsSchema },
    responses: { 204: { description: 'Excepción revocada' }, 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/availability',
    tags,
    summary: 'Franjas disponibles y bloqueadas de una sede para mostrar en la agenda',
    security: readSecurity,
    request: { query: agendaAvailabilityQuerySchema },
    responses: { 200: json(agendaAvailabilitySchema, 'Franjas por profesional'), 400: invalidInput, ...common },
  })
}
