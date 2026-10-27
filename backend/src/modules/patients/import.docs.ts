import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { errorResponse, forbidden, invalidInput, json, readSecurity, unauthenticated, writeSecurity } from '../../openapi/common.js'
import { importBodySchema, importPreviewSchema, importResultSchema } from './import.schemas.js'

export function registerPatientImportDocs(registry: OpenAPIRegistry): void {
  const tags = ['Pacientes']
  const common = { 401: unauthenticated, 403: forbidden }
  const body = { body: { content: { 'application/json': { schema: importBodySchema } } } }
  const rejected = { 400: invalidInput, 422: errorResponse('Encabezado incompleto, archivo vacío o sin filas válidas') }

  registry.registerPath({
    method: 'get',
    path: '/api/patient-imports/template',
    tags,
    summary: 'Plantilla CSV para importar pacientes',
    security: readSecurity,
    responses: { 200: { description: 'CSV separado por punto y coma', content: { 'text/csv': { schema: z.string() } } }, ...common },
  })
  registry.registerPath({
    method: 'post',
    path: '/api/patient-imports/preview',
    tags,
    summary: 'Revisa un CSV de pacientes y devuelve los errores por fila, sin importar nada',
    security: writeSecurity,
    request: body,
    responses: { 200: json(importPreviewSchema, 'Vista previa'), ...rejected, ...common },
  })
  registry.registerPath({
    method: 'post',
    path: '/api/patient-imports',
    tags,
    summary: 'Importa las filas válidas del CSV',
    description: 'Las filas con errores, los documentos repetidos y los pacientes que ya existen se omiten.',
    security: writeSecurity,
    request: body,
    responses: { 201: json(importResultSchema, 'Resultado'), 409: errorResponse('Otro usuario cargó alguno de esos documentos mientras tanto'), ...rejected, ...common },
  })
}
