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
  clinicalFileSchema,
  fileParamsSchema,
  filesPatientParamsSchema,
  listFilesQuerySchema,
  uploadFileQuerySchema,
} from './files.schemas.js'

export function registerFilesDocs(registry: OpenAPIRegistry): void {
  const tags = ['Archivos clínicos']
  const common = { 401: unauthenticated, 403: forbidden }

  registry.registerPath({
    method: 'get',
    path: '/api/patients/{patientId}/files',
    tags,
    summary: 'Archivos clínicos del paciente',
    description: 'Solo odontólogos. Por defecto no incluye los archivados.',
    security: readSecurity,
    request: { params: filesPatientParamsSchema, query: listFilesQuerySchema },
    responses: { 200: json(z.array(clinicalFileSchema), 'Archivos'), 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{patientId}/files',
    tags,
    summary: 'Sube un archivo clínico (PDF, JPG o PNG)',
    description:
      'El cuerpo es el contenido binario del archivo. El tipo se verifica por su contenido, no por la extensión. El tamaño máximo es configurable (20 MB por defecto). El archivo se guarda fuera de cualquier carpeta pública.',
    security: writeSecurity,
    request: {
      params: filesPatientParamsSchema,
      query: uploadFileQuerySchema,
      body: { content: { 'application/octet-stream': { schema: z.string().meta({ format: 'binary' }) } } },
    },
    responses: {
      201: json(clinicalFileSchema, 'Archivo guardado'),
      400: invalidInput,
      404: notFound,
      413: errorResponse('El archivo supera el tamaño máximo'),
      415: errorResponse('Tipo de archivo no permitido'),
      422: errorResponse('Archivo vacío, paciente archivado, sin perfil profesional o nota que no corresponde'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/patients/{patientId}/files/{fileId}/content',
    tags,
    summary: 'Descarga o visualiza un archivo clínico',
    description: 'Solo a través del backend, con sesión y permiso clínico. Cada descarga queda auditada.',
    security: readSecurity,
    request: { params: fileParamsSchema },
    responses: { 200: { description: 'Contenido del archivo' }, 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{patientId}/files/{fileId}/archive',
    tags,
    summary: 'Archiva un archivo clínico (no se borra)',
    security: writeSecurity,
    request: { params: fileParamsSchema },
    responses: { 200: json(clinicalFileSchema, 'Archivo archivado'), 404: notFound, ...common },
  })
}
