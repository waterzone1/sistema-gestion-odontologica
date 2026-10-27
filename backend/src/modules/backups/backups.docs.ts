import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { errorResponse, forbidden, invalidInput, json, notFound, readSecurity, unauthenticated, writeSecurity } from '../../openapi/common.js'
import { backupParamsSchema, backupRecordSchema, backupStatusSchema, restoreResultSchema, restoreSchema } from './backups.schemas.js'

export function registerBackupsDocs(registry: OpenAPIRegistry): void {
  const tags = ['Backups']
  const common = { 401: unauthenticated, 403: forbidden }

  registry.registerPath({
    method: 'get',
    path: '/api/backups',
    tags,
    summary: 'Historial de backups, del más reciente al más antiguo',
    description: 'Solo administración. Retención: 7 diarios, 4 semanales y los últimos 10 manuales.',
    security: readSecurity,
    responses: { 200: json(z.array(backupRecordSchema), 'Backups'), ...common },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/backups/status',
    tags,
    summary: 'Estado: mantenimiento, backup en curso, último exitoso y próximo programado',
    security: readSecurity,
    responses: { 200: json(backupStatusSchema, 'Estado'), ...common },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/backups',
    tags,
    summary: 'Genera un backup ahora',
    description:
      'Dump lógico completo de PostgreSQL más los archivos clínicos y un manifest con checksums, empaquetados juntos. Corre en segundo plano: consultar el historial para ver cuándo termina.',
    security: writeSecurity,
    responses: { 202: json(backupRecordSchema, 'Backup iniciado'), 409: errorResponse('Ya hay un backup o una restauración en curso'), ...common },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/backups/{id}/download',
    tags,
    summary: 'Descarga el paquete del backup',
    security: readSecurity,
    request: { params: backupParamsSchema },
    responses: { 200: { description: 'Archivo tar', content: { 'application/x-tar': { schema: z.string() } } }, 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/backups/{id}/restore',
    tags,
    summary: 'Restaura la base y los archivos desde un backup',
    description:
      'Verifica el checksum y la versión del esquema, pone el sistema en mantenimiento (las demás solicitudes reciben 503), restaura la base en una sola transacción y los archivos, y verifica que los conteos coincidan con el manifest.',
    security: writeSecurity,
    request: { params: backupParamsSchema, body: { content: { 'application/json': { schema: restoreSchema } } } },
    responses: {
      200: json(restoreResultSchema, 'Restaurado y verificado'),
      400: invalidInput,
      404: notFound,
      409: errorResponse('Ya hay un backup o una restauración en curso'),
      422: errorResponse('Backup dañado o de otra versión del sistema'),
      ...common,
    },
  })
}
