import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { errorResponse, forbidden, invalidInput, json, notFound, readSecurity, unauthenticated, writeSecurity } from '../../openapi/common.js'
import {
  generateRemindersSchema,
  reminderParamsSchema,
  reminderSchema,
  remindersDaySchema,
  remindersQuerySchema,
} from './reminders.schemas.js'

export function registerRemindersDocs(registry: OpenAPIRegistry): void {
  const tags = ['Recordatorios']
  const common = { 401: unauthenticated, 403: forbidden }

  registry.registerPath({
    method: 'get',
    path: '/api/reminders',
    tags,
    summary: 'Recordatorios de turnos de un día',
    security: readSecurity,
    request: { query: remindersQuerySchema },
    responses: { 200: json(remindersDaySchema, 'Recordatorios'), 400: invalidInput, ...common },
  })
  registry.registerPath({
    method: 'post',
    path: '/api/reminders/generate',
    tags,
    summary: 'Genera los recordatorios que falten para los turnos de un día',
    description:
      'Uno por turno pendiente o confirmado. Si el paciente no tiene un celular válido, queda como fallido con el motivo. No se envía nada solo: recepción lo manda por WhatsApp.',
    security: writeSecurity,
    request: { body: { content: { 'application/json': { schema: generateRemindersSchema } } } },
    responses: { 200: json(remindersDaySchema, 'Recordatorios del día'), 400: invalidInput, ...common },
  })
  const action = (path: string, summary: string) =>
    registry.registerPath({
      method: 'post',
      path,
      tags,
      summary,
      security: writeSecurity,
      request: { params: reminderParamsSchema },
      responses: { 200: json(reminderSchema, 'Recordatorio actualizado'), 404: notFound, 409: errorResponse('Estado no permitido'), ...common },
    })
  action('/api/reminders/{id}/sent', 'Marca el recordatorio como enviado')
  action('/api/reminders/{id}/confirm', 'Registra que el paciente confirmó y confirma el turno')
  action('/api/reminders/{id}/cancel', 'Descarta el recordatorio')
}
