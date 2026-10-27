import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { forbidden, invalidInput, json, readSecurity, unauthenticated } from '../../openapi/common.js'
import { auditListSchema, auditQuerySchema } from './audit.schemas.js'

export function registerAuditDocs(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/api/audit',
    tags: ['Auditoría'],
    summary: 'Registro de auditoría, del más reciente al más antiguo',
    description:
      'Solo administración. Muestra quién hizo qué y cuándo, con identificadores y nombres de campos: nunca contraseñas, tokens ni contenido clínico.',
    security: readSecurity,
    request: { query: auditQuerySchema },
    responses: { 200: json(auditListSchema, 'Eventos'), 400: invalidInput, 401: unauthenticated, 403: forbidden },
  })
}
