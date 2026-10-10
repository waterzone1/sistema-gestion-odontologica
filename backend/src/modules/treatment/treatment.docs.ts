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
  addItemSchema,
  cancelItemSchema,
  createPlanSchema,
  itemParamsSchema,
  planIdParamsSchema,
  planParamsSchema,
  priceItemSchema,
  treatmentPlanSchema,
} from './treatment.schemas.js'

export function registerTreatmentDocs(registry: OpenAPIRegistry): void {
  const tags = ['Plan de tratamiento']
  const common = { 401: unauthenticated, 403: forbidden }
  const bodyOf = (schema: z.ZodType) => ({ body: { content: { 'application/json': { schema } } } })
  const plan = (description: string) => json(treatmentPlanSchema, description)
  const base = '/api/patients/{patientId}/treatment-plans'

  registry.registerPath({
    method: 'get',
    path: base,
    tags,
    summary: 'Planes de tratamiento del paciente',
    description:
      'El odontólogo ve piezas y superficies pero no importes; recepción y administración ven prácticas e importes pero no piezas ni superficies.',
    security: readSecurity,
    request: { params: planParamsSchema },
    responses: { 200: json(z.array(treatmentPlanSchema), 'Planes'), 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'post',
    path: base,
    tags,
    summary: 'Crea un plan de tratamiento',
    security: writeSecurity,
    request: { params: planParamsSchema, ...bodyOf(createPlanSchema) },
    responses: { 201: plan('Plan creado'), 404: notFound, 422: errorResponse('Paciente archivado o sin perfil profesional'), ...common },
  })

  registry.registerPath({
    method: 'post',
    path: `${base}/{planId}/items`,
    tags,
    summary: 'Agrega una práctica al plan, con pieza y superficies opcionales',
    security: writeSecurity,
    request: { params: planIdParamsSchema, ...bodyOf(addItemSchema) },
    responses: {
      201: plan('Plan actualizado'),
      400: invalidInput,
      404: notFound,
      409: errorResponse('El plan está cerrado'),
      422: errorResponse('Pieza, superficie o práctica inválidas'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'put',
    path: `${base}/{planId}/items/{itemId}/price`,
    tags,
    summary: 'Fija el precio acordado de un ítem',
    description: 'Recepción y administración. Al registrar la prestación de ese ítem se cobra este precio.',
    security: writeSecurity,
    request: { params: itemParamsSchema, ...bodyOf(priceItemSchema) },
    responses: { 200: plan('Plan actualizado'), 400: invalidInput, 404: notFound, 409: errorResponse('Ítem o plan cerrado'), ...common },
  })

  registry.registerPath({
    method: 'post',
    path: `${base}/{planId}/accept`,
    tags,
    summary: 'Registra que el paciente aceptó el presupuesto',
    description: 'Exige que todos los ítems vigentes estén cotizados.',
    security: writeSecurity,
    request: { params: planIdParamsSchema },
    responses: {
      200: plan('Presupuesto aceptado'),
      404: notFound,
      409: errorResponse('El presupuesto ya fue aceptado o el plan está cerrado'),
      422: errorResponse('Plan sin ítems o con ítems sin cotizar'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: `${base}/{planId}/items/{itemId}/start`,
    tags,
    summary: 'Marca un ítem como en curso',
    security: writeSecurity,
    request: { params: itemParamsSchema },
    responses: { 200: plan('Plan actualizado'), 404: notFound, 409: errorResponse('El ítem no está pendiente'), ...common },
  })

  registry.registerPath({
    method: 'post',
    path: `${base}/{planId}/items/{itemId}/cancel`,
    tags,
    summary: 'Cancela un ítem con motivo (no se borra)',
    security: writeSecurity,
    request: { params: itemParamsSchema, ...bodyOf(cancelItemSchema) },
    responses: { 200: plan('Plan actualizado'), 400: invalidInput, 404: notFound, 409: errorResponse('Ítem cerrado'), ...common },
  })
}
