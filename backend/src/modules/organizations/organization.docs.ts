import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { forbidden, invalidInput, json, readSecurity, unauthenticated, writeSecurity } from '../../openapi/common.js'
import { organizationModulesSchema, organizationSchema, updateOrganizationSchema, updateSettingsSchema } from './organization.schemas.js'

export function registerOrganizationDocs(registry: OpenAPIRegistry): void {
  const tags = ['Organización']
  const common = { 401: unauthenticated, 403: forbidden }
  const body = <T extends Parameters<typeof json>[0]>(schema: T) => ({ body: { content: { 'application/json': { schema } } } })

  registry.registerPath({
    method: 'get',
    path: '/api/organization',
    tags,
    summary: 'Datos, módulos y ajustes del consultorio',
    security: readSecurity,
    responses: { 200: json(organizationSchema, 'Organización'), 401: unauthenticated },
  })
  registry.registerPath({
    method: 'patch',
    path: '/api/organization',
    tags,
    summary: 'Cambia el nombre o la zona horaria del consultorio',
    description: 'Solo administración. El nombre aparece en los recordatorios; la zona horaria rige la agenda, la caja y los reportes.',
    security: writeSecurity,
    request: body(updateOrganizationSchema),
    responses: { 200: json(organizationSchema, 'Organización'), 400: invalidInput, ...common },
  })
  registry.registerPath({
    method: 'put',
    path: '/api/organization/settings',
    tags,
    summary: 'Guarda una o más secciones de ajustes',
    description:
      'Cada sección exige su permiso: backups (administración), recordatorios (quien administra turnos), archivos y sesiones (administración). El tamaño de archivo no puede superar el tope del servidor.',
    security: writeSecurity,
    request: body(updateSettingsSchema),
    responses: { 200: json(organizationSchema, 'Organización'), 400: invalidInput, 422: invalidInput, ...common },
  })
  registry.registerPath({
    method: 'put',
    path: '/api/organization/modules',
    tags,
    summary: 'Activa o desactiva módulos opcionales',
    description:
      'Solo administración. Con coberturas desactivadas se ocultan y rechazan coberturas, convenios y liquidaciones, y las prestaciones nuevas se cobran completas al paciente. Los datos cargados se conservan.',
    security: writeSecurity,
    request: body(organizationModulesSchema),
    responses: { 200: json(organizationModulesSchema, 'Módulos vigentes'), 400: invalidInput, ...common },
  })
}
