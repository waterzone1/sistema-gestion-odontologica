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
  appointmentIdParamsSchema,
  appointmentSchema,
  changeStatusSchema,
  closeAppointmentSchema,
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  reactivateSchema,
  updateAppointmentSchema,
} from './appointments.schemas.js'

export function registerAppointmentsDocs(registry: OpenAPIRegistry): void {
  const tags = ['Turnos']
  const common = { 401: unauthenticated, 403: forbidden }
  const bodyOf = (schema: z.ZodType) => ({ body: { content: { 'application/json': { schema } } } })
  const params = { params: appointmentIdParamsSchema }

  registry.registerPath({
    method: 'get',
    path: '/api/appointments',
    tags,
    summary: 'Lista los turnos de un rango de fechas',
    description:
      'Recepción y administración ven los turnos de sus sedes (el administrador, los de todas). Un odontólogo ve solo los suyos. El rango máximo es de 62 días, o de 366 si se filtra por paciente.',
    security: readSecurity,
    request: { query: listAppointmentsQuerySchema },
    responses: { 200: json(z.array(appointmentSchema), 'Turnos del rango'), 400: invalidInput, ...common },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/appointments',
    tags,
    summary: 'Crea un turno',
    description:
      'Un profesional no puede tener dos turnos no cancelados que se superpongan, aunque sean en sedes distintas: lo garantiza la base de datos.',
    security: writeSecurity,
    request: bodyOf(createAppointmentSchema),
    responses: {
      201: json(appointmentSchema, 'Turno creado'),
      400: invalidInput,
      404: notFound,
      409: errorResponse('El profesional ya tiene un turno en ese horario'),
      422: errorResponse('Rango horario inválido, sede, profesional o práctica inválidos, o paciente archivado'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/appointments/{id}',
    tags,
    summary: 'Detalle de un turno',
    security: readSecurity,
    request: params,
    responses: { 200: json(appointmentSchema, 'Turno'), 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/appointments/{id}',
    tags,
    summary: 'Edita o reprograma un turno pendiente o confirmado',
    description:
      'Si se cambia el horario o el profesional de un turno confirmado, vuelve a quedar pendiente de confirmar.',
    security: writeSecurity,
    request: { ...params, ...bodyOf(updateAppointmentSchema) },
    responses: {
      200: json(appointmentSchema, 'Turno actualizado'),
      400: invalidInput,
      404: notFound,
      409: errorResponse('Horario ocupado o turno que ya no se puede modificar'),
      422: errorResponse('Rango horario, sede, profesional o práctica inválidos'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/appointments/{id}/status',
    tags,
    summary: 'Cambia el estado del turno',
    description:
      'Confirmar y cancelar requieren gestionar la agenda; marcar atendido o ausente también lo puede hacer el odontólogo dueño del turno. Cancelar exige un motivo y el turno se conserva.',
    security: writeSecurity,
    request: { ...params, ...bodyOf(changeStatusSchema) },
    responses: {
      200: json(appointmentSchema, 'Turno actualizado'),
      400: invalidInput,
      404: notFound,
      409: errorResponse('Transición no permitida'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/appointments/{id}/reactivate',
    tags,
    summary: 'Reactiva un turno cancelado o ausente',
    description:
      'Vuelve a Pendiente si el horario sigue libre. Aplica las mismas reglas de disponibilidad que al dar un turno nuevo.',
    security: writeSecurity,
    request: { ...params, ...bodyOf(reactivateSchema) },
    responses: {
      200: json(appointmentSchema, 'Turno reactivado'),
      404: notFound,
      409: errorResponse('El turno no está cancelado ni ausente, o el horario ya está ocupado'),
      422: errorResponse('Fuera de la disponibilidad del profesional o con advertencias sin confirmar'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/appointments/{id}/close',
    tags,
    summary: 'Cierra un turno atendido sin prestación propia',
    description:
      'Lo marca como sesión de un ítem del plan de tratamiento (ya cobrado o en curso) o sin cargo con motivo. Registrar una prestación desde el turno también lo cierra.',
    security: writeSecurity,
    request: { ...params, ...bodyOf(closeAppointmentSchema) },
    responses: {
      200: json(appointmentSchema, 'Turno cerrado'),
      400: invalidInput,
      404: notFound,
      409: errorResponse('El turno no está pendiente de cierre'),
      422: errorResponse('El ítem no corresponde a un plan vigente del paciente'),
      ...common,
    },
  })
}
