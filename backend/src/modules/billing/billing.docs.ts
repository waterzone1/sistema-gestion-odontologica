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
  accountSchema,
  billingPatientParamsSchema,
  createPaymentSchema,
  createServiceSchema,
  debtorSchema,
  paymentParamsSchema,
  paymentSchema,
  serviceParamsSchema,
  serviceSchema,
  voidSchema,
} from './billing.schemas.js'

export function registerBillingDocs(registry: OpenAPIRegistry): void {
  const tags = ['Prestaciones y cobros']
  const common = { 401: unauthenticated, 403: forbidden }
  const bodyOf = (schema: z.ZodType) => ({ body: { content: { 'application/json': { schema } } } })
  const patientParams = { params: billingPatientParamsSchema }

  registry.registerPath({
    method: 'get',
    path: '/api/patients/{patientId}/services',
    tags,
    summary: 'Prestaciones realizadas al paciente',
    security: readSecurity,
    request: patientParams,
    responses: { 200: json(z.array(serviceSchema), 'Prestaciones, de la más reciente a la más antigua'), 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{patientId}/services',
    tags,
    summary: 'Registra una prestación realizada',
    description:
      'Solo la registra un odontólogo, a su nombre. El precio se toma del catálogo en ese momento y queda fijo en la prestación.',
    security: writeSecurity,
    request: { ...patientParams, ...bodyOf(createServiceSchema) },
    responses: {
      201: json(serviceSchema, 'Prestación registrada'),
      400: invalidInput,
      404: notFound,
      422: errorResponse('Paciente archivado, sin perfil profesional, práctica o turno inválidos, o fecha futura'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{patientId}/services/{serviceId}/void',
    tags,
    summary: 'Anula una prestación',
    description: 'Solo administración. La prestación se conserva marcada como anulada, con el motivo.',
    security: writeSecurity,
    request: { params: serviceParamsSchema, ...bodyOf(voidSchema) },
    responses: {
      200: json(serviceSchema, 'Prestación anulada'),
      400: invalidInput,
      404: notFound,
      409: errorResponse('La prestación ya estaba anulada'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/patients/{patientId}/account',
    tags,
    summary: 'Cuenta corriente del paciente',
    description:
      'El saldo se calcula siempre como prestaciones vigentes menos pagos vigentes; no se guarda. Un saldo negativo es saldo a favor.',
    security: readSecurity,
    request: patientParams,
    responses: { 200: json(accountSchema, 'Cuenta'), 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{patientId}/payments',
    tags,
    summary: 'Registra un pago',
    description:
      'Se aplica a las prestaciones indicadas, o a las pendientes más antiguas primero si no se indican. Admite pagos parciales; lo que excede lo pendiente queda como saldo a favor. Mercado Pago es un medio de pago con referencia opcional.',
    security: writeSecurity,
    request: { ...patientParams, ...bodyOf(createPaymentSchema) },
    responses: {
      201: json(paymentSchema, 'Pago registrado'),
      400: invalidInput,
      404: notFound,
      422: errorResponse('Fecha futura o prestaciones elegidas inválidas'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{patientId}/payments/{paymentId}/void',
    tags,
    summary: 'Anula un pago',
    description: 'Solo administración. El pago se conserva marcado como anulado, con el motivo, y deja de contar en el saldo.',
    security: writeSecurity,
    request: { params: paymentParamsSchema, ...bodyOf(voidSchema) },
    responses: {
      200: json(paymentSchema, 'Pago anulado'),
      400: invalidInput,
      404: notFound,
      409: errorResponse('El pago ya estaba anulado'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/debtors',
    tags,
    summary: 'Pacientes con saldo pendiente',
    description: 'Los 20 mayores saldos a cobrar.',
    security: readSecurity,
    responses: { 200: json(z.array(debtorSchema), 'Pacientes con saldo a cobrar'), ...common },
  })
}
