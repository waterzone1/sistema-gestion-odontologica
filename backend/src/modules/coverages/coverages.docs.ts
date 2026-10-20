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
  agreementSchema,
  coverageQuoteQuerySchema,
  coverageQuoteSchema,
  createAgreementSchema,
  createPatientCoverageSchema,
  createPlanSchema,
  createProviderSchema,
  idParamsSchema,
  patientCoverageParamsSchema,
  patientCoverageSchema,
  patientParamsSchema,
  providerSchema,
  updateAgreementSchema,
  updatePlanSchema,
  updateProviderSchema,
} from './coverages.schemas.js'

export function registerCoveragesDocs(registry: OpenAPIRegistry): void {
  const tags = ['Coberturas']
  const common = { 401: unauthenticated, 403: forbidden }
  const bodyOf = (schema: z.ZodType) => ({ body: { content: { 'application/json': { schema } } } })
  const write = (method: 'post' | 'patch' | 'put', path: string, summary: string, request: object, response: z.ZodType, extra = {}) =>
    registry.registerPath({
      method,
      path,
      tags,
      summary,
      security: writeSecurity,
      request,
      responses: { [method === 'post' ? 201 : 200]: json(response, 'Guardado'), 400: invalidInput, 404: notFound, ...extra, ...common },
    })

  registry.registerPath({
    method: 'get',
    path: '/api/coverages',
    tags,
    summary: 'Obras sociales y prepagas con sus planes',
    security: readSecurity,
    responses: { 200: json(z.array(providerSchema), 'Coberturas'), ...common },
  })
  const duplicate = { 409: errorResponse('Ya existe uno con ese nombre') }
  write('post', '/api/coverages/providers', 'Da de alta una cobertura', bodyOf(createProviderSchema), providerSchema, duplicate)
  write('patch', '/api/coverages/providers/{id}', 'Modifica o desactiva una cobertura', { params: idParamsSchema, ...bodyOf(updateProviderSchema) }, providerSchema, duplicate)
  write('post', '/api/coverages/providers/{id}/plans', 'Agrega un plan a la cobertura', { params: idParamsSchema, ...bodyOf(createPlanSchema) }, providerSchema, duplicate)
  write('patch', '/api/coverages/plans/{id}', 'Modifica o desactiva un plan', { params: idParamsSchema, ...bodyOf(updatePlanSchema) }, providerSchema, duplicate)

  registry.registerPath({
    method: 'get',
    path: '/api/coverages/plans/{id}/agreements',
    tags,
    summary: 'Convenios del plan, del más reciente al más antiguo',
    security: readSecurity,
    request: { params: idParamsSchema },
    responses: { 200: json(z.array(agreementSchema), 'Convenios'), 404: notFound, ...common },
  })
  const overlap = { 409: errorResponse('Se superpone con otro convenio del plan') }
  write('post', '/api/coverages/plans/{id}/agreements', 'Crea un convenio con importes por práctica', { params: idParamsSchema, ...bodyOf(createAgreementSchema) }, agreementSchema, overlap)
  write('put', '/api/coverages/agreements/{id}', 'Cierra la vigencia o reemplaza los importes del convenio', { params: idParamsSchema, ...bodyOf(updateAgreementSchema) }, agreementSchema, overlap)

  registry.registerPath({
    method: 'get',
    path: '/api/patients/{patientId}/coverages',
    tags,
    summary: 'Coberturas del paciente, la vigente primero',
    security: readSecurity,
    request: { params: patientParamsSchema },
    responses: { 200: json(z.array(patientCoverageSchema), 'Coberturas'), 404: notFound, ...common },
  })
  write(
    'post',
    '/api/patients/{patientId}/coverages',
    'Asigna una cobertura al paciente',
    { params: patientParamsSchema, ...bodyOf(createPatientCoverageSchema) },
    patientCoverageSchema,
    { 422: errorResponse('Plan inactivo o paciente archivado') },
  )
  write('post', '/api/patients/{patientId}/coverages/{coverageId}/archive', 'Archiva una cobertura del paciente', { params: patientCoverageParamsSchema }, patientCoverageSchema)

  registry.registerPath({
    method: 'get',
    path: '/api/patients/{patientId}/coverage-quote',
    tags,
    summary: 'Qué cubre la cobertura vigente del paciente para una práctica',
    description: 'Los importes son nulos para quien no ve la cuenta.',
    security: readSecurity,
    request: { params: patientParamsSchema, query: coverageQuoteQuerySchema },
    responses: { 200: json(coverageQuoteSchema, 'Cobertura aplicable'), 404: notFound, ...common },
  })
}
