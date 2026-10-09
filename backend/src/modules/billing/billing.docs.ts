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
  adjustPriceSchema,
  billingPatientParamsSchema,
  chargeResultSchema,
  createChargeSchema,
  creditParamsSchema,
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
      'La registra un odontólogo (siempre a su nombre), recepción o administración (eligiendo el profesional). El precio es el del catálogo salvo que recepción o administración indiquen otro; el odontólogo no ve importes.',
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
    path: '/api/patients/{patientId}/services/{serviceId}/price',
    tags,
    summary: 'Ajusta el precio de una prestación',
    description: 'Recepción y administración. No puede quedar por debajo de lo ya pagado. Queda auditado con el precio anterior.',
    security: writeSecurity,
    request: { params: serviceParamsSchema, ...bodyOf(adjustPriceSchema) },
    responses: {
      200: json(serviceSchema, 'Prestación actualizada'),
      400: invalidInput,
      404: notFound,
      409: errorResponse('La prestación está anulada'),
      422: errorResponse('El precio es menor a lo ya pagado'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{patientId}/services/{serviceId}/void',
    tags,
    summary: 'Anula una prestación',
    description: 'Recepción solo lo cargado en el día; administración siempre. La prestación se conserva marcada como anulada, con el motivo.',
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
    summary: 'Registra un cobro',
    description:
      'Un cobro puede combinar varios medios de pago y usar saldo a favor si quien cobra lo elige; ese uso queda registrado como un movimiento propio. Primero se aplica el saldo a favor y después cada medio, a las prestaciones indicadas o a las pendientes más antiguas. Admite pagos parciales; lo que excede lo pendiente queda como saldo a favor. Mercado Pago es un medio de pago con referencia opcional.',
    security: writeSecurity,
    request: { ...patientParams, ...bodyOf(createChargeSchema) },
    responses: {
      201: json(chargeResultSchema, 'Cobro registrado'),
      400: invalidInput,
      404: notFound,
      422: errorResponse('Fecha futura, prestaciones elegidas inválidas o saldo a favor insuficiente'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/patients/{patientId}/payments/{paymentId}/void',
    tags,
    summary: 'Anula un pago',
    description: 'Recepción solo lo cargado en el día; administración siempre. El pago se conserva marcado como anulado, con el motivo, y deja de contar en el saldo.',
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
    method: 'post',
    path: '/api/patients/{patientId}/credits/{creditId}/void',
    tags,
    summary: 'Anula un uso de saldo a favor',
    description: 'Recepción solo lo cargado en el día; administración siempre. El saldo a favor vuelve a quedar disponible.',
    security: writeSecurity,
    request: { params: creditParamsSchema, ...bodyOf(voidSchema) },
    responses: {
      200: json(paymentSchema, 'Uso de saldo a favor anulado'),
      400: invalidInput,
      404: notFound,
      409: errorResponse('Ya estaba anulado'),
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
