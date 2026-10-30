import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { forbidden, invalidInput, json, readSecurity, unauthenticated } from '../../openapi/common.js'
import { debtorSchema } from '../billing/billing.schemas.js'
import { appointmentsReportSchema, collectionsReportSchema, reportQuerySchema, servicesReportSchema } from './reports.schemas.js'

export function registerReportsDocs(registry: OpenAPIRegistry): void {
  const tags = ['Reportes']
  const common = { 400: invalidInput, 401: unauthenticated, 403: forbidden }
  const report = (path: string, summary: string, schema: z.ZodType) =>
    registry.registerPath({
      method: 'get',
      path,
      tags,
      summary,
      description: 'Administración y recepción. Período en días de la zona horaria del consultorio, de hasta un año.',
      security: readSecurity,
      request: { query: reportQuerySchema },
      responses: { 200: json(schema, 'Reporte'), ...common },
    })

  report('/api/reports/appointments', 'Turnos por estado y por profesional, con ausentismo y cancelaciones', appointmentsReportSchema)
  report('/api/reports/collections', 'Cobranzas vigentes por día y por medio de pago', collectionsReportSchema)
  report('/api/reports/services', 'Prestaciones por profesional y por práctica', servicesReportSchema)

  registry.registerPath({
    method: 'get',
    path: '/api/reports/debtors',
    tags,
    summary: 'Todos los pacientes con saldo pendiente, de mayor a menor',
    security: readSecurity,
    responses: { 200: json(z.array(debtorSchema), 'Pacientes con saldo'), 401: unauthenticated, 403: forbidden },
  })
}
