import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { forbidden, invalidInput, json, unauthenticated, writeSecurity } from '../../openapi/common.js'
import { organizationModulesSchema } from './organization.schemas.js'

export function registerOrganizationDocs(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'put',
    path: '/api/organization/modules',
    tags: ['Organización'],
    summary: 'Activa o desactiva módulos opcionales',
    description:
      'Solo administración. Con coberturas desactivadas se ocultan y rechazan coberturas, convenios y liquidaciones, y las prestaciones nuevas se cobran completas al paciente. Los datos cargados se conservan.',
    security: writeSecurity,
    request: { body: { content: { 'application/json': { schema: organizationModulesSchema } } } },
    responses: { 200: json(organizationModulesSchema, 'Módulos vigentes'), 400: invalidInput, 401: unauthenticated, 403: forbidden },
  })
}
