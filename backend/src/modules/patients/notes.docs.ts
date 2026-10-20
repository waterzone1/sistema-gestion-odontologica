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
  createNoteSchema,
  listNotesQuerySchema,
  noteParamsSchema,
  notesPatientParamsSchema,
  patientNoteSchema,
} from './notes.schemas.js'

export function registerPatientNotesDocs(registry: OpenAPIRegistry): void {
  const tags = ['Mensajes sobre el paciente']
  const common = { 401: unauthenticated, 403: forbidden }

  registry.registerPath({
    method: 'get',
    path: '/api/patients/{patientId}/notes',
    tags,
    summary: 'Mensajes internos sobre el paciente',
    description: 'Mensajes administrativos entre recepción y odontólogos. No son información clínica.',
    security: readSecurity,
    request: { params: notesPatientParamsSchema, query: listNotesQuerySchema },
    responses: { 200: json(z.array(patientNoteSchema), 'Del más reciente al más antiguo'), 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{patientId}/notes',
    tags,
    summary: 'Dejar un mensaje sobre el paciente',
    description: 'No se edita ni se borra: solo se archiva.',
    security: writeSecurity,
    request: {
      params: notesPatientParamsSchema,
      body: { content: { 'application/json': { schema: createNoteSchema } } },
    },
    responses: {
      201: json(patientNoteSchema, 'Mensaje creado'),
      400: invalidInput,
      404: notFound,
      422: errorResponse('El paciente está archivado'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{patientId}/notes/{noteId}/archive',
    tags,
    summary: 'Archivar un mensaje que ya no aplica',
    security: writeSecurity,
    request: { params: noteParamsSchema },
    responses: { 200: json(patientNoteSchema, 'Mensaje archivado'), 404: notFound, ...common },
  })
}
