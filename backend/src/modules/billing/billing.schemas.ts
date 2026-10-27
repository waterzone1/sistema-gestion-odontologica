import { z } from 'zod'
import { appointmentSchema } from '../appointments/appointments.schemas.js'
import { SURFACES } from '../odontogram/domain/fdi.js'

export const currencySchema = z.enum(['ARS', 'USD']).meta({ id: 'Currency' })

const moneySchema = z
  .string()
  .trim()
  .regex(/^(?!0+(\.0+)?$)\d{1,12}(\.\d{1,2})?$/, 'Ingresá un importe mayor a cero, con hasta 2 decimales')

const reasonSchema = z.string().trim().min(3, 'Indicá el motivo').max(300)

const PAYMENT_METHODS = ['CASH', 'TRANSFER', 'CARD', 'MERCADOPAGO', 'OTHER'] as const

export const billingPatientParamsSchema = z.object({ patientId: z.uuid() })
export const serviceParamsSchema = z.object({ patientId: z.uuid(), serviceId: z.uuid() })
export const paymentParamsSchema = z.object({ patientId: z.uuid(), paymentId: z.uuid() })
export const creditParamsSchema = z.object({ patientId: z.uuid(), creditId: z.uuid() })

export const createServiceSchema = z
  .object({
    practiceId: z.uuid().optional(),
    treatmentItemId: z.uuid().optional().meta({ description: 'Ítem del plan de tratamiento que se realizó: toma su práctica, pieza, superficies y precio acordado' }),
    professionalId: z.uuid().optional(),
    appointmentId: z.uuid().nullish(),
    performedAt: z.iso.datetime().optional(),
    price: moneySchema.optional(),
    tooth: z.number().int().nullish(),
    surfaces: z.array(z.enum(SURFACES)).max(5).default([]),
    applyCoverage: z.boolean().default(true).meta({ description: 'Aplica la cobertura vigente del paciente si hay convenio para la práctica' }),
    authorizationCode: z
      .string()
      .trim()
      .max(60)
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .refine((value) => value.practiceId !== undefined || value.treatmentItemId !== undefined, {
    path: ['practiceId'],
    message: 'Elegí la práctica o el ítem del plan',
  })
  .meta({ id: 'CreateServiceInput' })

export const adjustPriceSchema = z.object({ price: moneySchema }).meta({ id: 'AdjustPriceInput' })

export const voidSchema = z.object({ reason: reasonSchema }).meta({ id: 'VoidInput' })

const paymentMethodSchema = z.enum(PAYMENT_METHODS).meta({ id: 'PaymentMethod' })

export const createChargeSchema = z
  .object({
    lines: z
      .array(
        z.object({
          amount: moneySchema.meta({ description: 'Importe en la moneda del pago' }),
          currency: currencySchema.default('ARS'),
          method: paymentMethodSchema,
          externalReference: z.string().trim().max(120).nullish(),
        }),
      )
      .max(10)
      .default([]),
    credit: moneySchema.optional(),
    exchangeRate: moneySchema.optional().meta({
      description:
        'Cotización del dólar que vio quien cobra. Obligatoria si hay pagos en dólares: si no coincide con la vigente, el cobro se rechaza',
    }),
    receivedAt: z.iso.datetime().optional(),
    serviceIds: z.array(z.uuid()).min(1).max(100).optional(),
  })
  .refine((value) => value.lines.length > 0 || value.credit !== undefined, {
    message: 'Agregá al menos un medio de pago',
  })
  .refine((value) => value.exchangeRate !== undefined || value.lines.every((line) => line.currency === 'ARS'), {
    path: ['exchangeRate'],
    message: 'Falta la cotización del dólar',
  })
  .meta({ id: 'CreateChargeInput' })

const record = {
  status: z.enum(['ACTIVE', 'VOIDED']),
  voidReason: z.string().nullable(),
  voidable: z.boolean().meta({ description: 'Si quien consulta puede anularlo ahora' }),
  createdAt: z.iso.datetime(),
}

const amount = (description: string) => z.string().nullable().meta({ example: '25000.00', description })

export const serviceSchema = z
  .object({
    id: z.uuid(),
    practice: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
    professional: z.object({ id: z.uuid(), displayName: z.string() }),
    appointmentId: z.uuid().nullable(),
    treatmentItemId: z.uuid().nullable(),
    tooth: z.number().int().nullable().meta({ description: 'Nulo para quien no accede a datos clínicos' }),
    surfaces: z.array(z.enum(SURFACES)),
    price: amount('A cargo del paciente (si hay cobertura, el coseguro). Nulo para quien no puede ver importes'),
    coverageAmount: amount('A cargo de la cobertura, pendiente de liquidar'),
    coverage: z.object({ provider: z.string(), plan: z.string(), affiliateNumber: z.string() }).nullable(),
    authorizationCode: z.string().nullable(),
    catalogPrice: amount('Precio del catálogo al registrarla'),
    paid: amount('Importe cubierto por pagos vigentes'),
    pending: amount('Importe que falta pagar'),
    performedAt: z.iso.datetime(),
    ...record,
  })
  .meta({ id: 'PerformedService' })

export const paymentSchema = z
  .object({
    id: z.uuid(),
    amount: z.string().meta({ example: '10000.00', description: 'Equivalente en pesos: es lo que descuenta de la deuda' }),
    currency: currencySchema,
    originalAmount: z.string().meta({ description: 'Importe en la moneda en que se pagó' }),
    exchangeRate: z.string().meta({ description: 'Cotización usada al cobrar. 1 para pesos' }),
    method: z
      .enum([...PAYMENT_METHODS, 'CREDIT'])
      .meta({ id: 'MovementMethod', description: 'CREDIT es un uso de saldo a favor, no un ingreso de dinero' }),
    externalReference: z.string().nullable(),
    receivedAt: z.iso.datetime(),
    allocated: z.string(),
    unallocated: z.string().meta({ description: 'Parte del pago que no cubre ninguna prestación: saldo a favor' }),
    createdBy: z.string(),
    ...record,
  })
  .meta({ id: 'Payment' })

export const chargeResultSchema = z
  .object({
    payments: z.array(paymentSchema),
    creditApplied: z.string(),
  })
  .meta({ id: 'ChargeResult' })

export const accountSchema = z
  .object({
    balance: z.string().meta({
      example: '15000.00',
      description: 'Saldo a cobrar: lo que falta pagar de las prestaciones vigentes. El saldo a favor no se descuenta hasta usarlo',
    }),
    totalServices: z.string(),
    totalPayments: z.string(),
    availableCredit: z.string().meta({ description: 'Saldo a favor disponible para aplicar a prestaciones' }),
    services: z.array(serviceSchema),
    payments: z.array(paymentSchema),
  })
  .meta({ id: 'Account' })

export const debtorSchema = z
  .object({
    patientId: z.uuid(),
    fullName: z.string(),
    balance: z.string(),
  })
  .meta({ id: 'Debtor' })

const unbilledItemSchema = z
  .object({
    id: z.uuid(),
    planId: z.uuid(),
    practice: z.string(),
    patient: z.object({ id: z.uuid(), fullName: z.string() }),
    professional: z.string(),
    completedAt: z.iso.datetime(),
  })
  .meta({ id: 'UnbilledTreatmentItem' })

export const pendingBillingSchema = z
  .object({
    appointments: z.array(appointmentSchema).meta({ description: 'Turnos atendidos de los últimos 90 días sin prestación ni cierre' }),
    items: z.array(unbilledItemSchema).meta({ description: 'Ítems del plan marcados realizados sin prestación registrada' }),
  })
  .meta({ id: 'PendingBilling' })

export type CreateServiceInput = z.infer<typeof createServiceSchema>
export type CreateChargeInput = z.infer<typeof createChargeSchema>
export type ServiceDto = z.infer<typeof serviceSchema>
export type PaymentDto = z.infer<typeof paymentSchema>
export type ChargeResultDto = z.infer<typeof chargeResultSchema>
export type AccountDto = z.infer<typeof accountSchema>
export type DebtorDto = z.infer<typeof debtorSchema>
export type UnbilledItemDto = z.infer<typeof unbilledItemSchema>
export type PendingBillingDto = z.infer<typeof pendingBillingSchema>
