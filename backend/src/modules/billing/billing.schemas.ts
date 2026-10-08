import { z } from 'zod'

const moneySchema = z
  .string()
  .trim()
  .regex(/^(?!0+(\.0+)?$)\d{1,12}(\.\d{1,2})?$/, 'Ingresá un importe mayor a cero, con hasta 2 decimales')

const reasonSchema = z.string().trim().min(3, 'Indicá el motivo').max(300)

const PAYMENT_METHODS = ['CASH', 'TRANSFER', 'CARD', 'MERCADOPAGO', 'OTHER'] as const

export const billingPatientParamsSchema = z.object({ patientId: z.uuid() })
export const serviceParamsSchema = z.object({ patientId: z.uuid(), serviceId: z.uuid() })
export const paymentParamsSchema = z.object({ patientId: z.uuid(), paymentId: z.uuid() })

export const createServiceSchema = z
  .object({
    practiceId: z.uuid(),
    appointmentId: z.uuid().nullish(),
    performedAt: z.iso.datetime().optional(),
  })
  .meta({ id: 'CreateServiceInput' })

export const voidSchema = z.object({ reason: reasonSchema }).meta({ id: 'VoidInput' })

export const createPaymentSchema = z
  .object({
    amount: moneySchema,
    method: z.enum(PAYMENT_METHODS),
    externalReference: z.string().trim().max(120).nullish(),
    receivedAt: z.iso.datetime().optional(),
    serviceIds: z.array(z.uuid()).min(1).max(100).optional(),
  })
  .meta({ id: 'CreatePaymentInput' })

const paymentMethodSchema = z.enum(PAYMENT_METHODS).meta({ id: 'PaymentMethod' })

const record = {
  status: z.enum(['ACTIVE', 'VOIDED']),
  voidReason: z.string().nullable(),
}

export const serviceSchema = z
  .object({
    id: z.uuid(),
    practice: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
    professional: z.object({ id: z.uuid(), displayName: z.string() }),
    appointmentId: z.uuid().nullable(),
    price: z.string().meta({ example: '25000.00' }),
    paid: z.string().meta({ example: '10000.00', description: 'Importe cubierto por pagos vigentes' }),
    pending: z.string().meta({ example: '15000.00' }),
    performedAt: z.iso.datetime(),
    ...record,
  })
  .meta({ id: 'PerformedService' })

export const paymentSchema = z
  .object({
    id: z.uuid(),
    amount: z.string().meta({ example: '10000.00' }),
    method: paymentMethodSchema,
    externalReference: z.string().nullable(),
    receivedAt: z.iso.datetime(),
    allocated: z.string(),
    unallocated: z.string().meta({ description: 'Parte del pago que no cubre ninguna prestación: saldo a favor' }),
    createdBy: z.string(),
    ...record,
  })
  .meta({ id: 'Payment' })

export const accountSchema = z
  .object({
    balance: z.string().meta({
      example: '15000.00',
      description: 'Prestaciones vigentes menos pagos vigentes. Negativo si el paciente tiene saldo a favor',
    }),
    totalServices: z.string(),
    totalPayments: z.string(),
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

export type CreateServiceInput = z.infer<typeof createServiceSchema>
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>
export type ServiceDto = z.infer<typeof serviceSchema>
export type PaymentDto = z.infer<typeof paymentSchema>
export type AccountDto = z.infer<typeof accountSchema>
export type DebtorDto = z.infer<typeof debtorSchema>
