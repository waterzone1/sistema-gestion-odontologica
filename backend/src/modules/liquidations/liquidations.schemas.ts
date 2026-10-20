import { z } from 'zod'

const daySchema = z.iso.date('Fecha inválida')
const amountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Ingresá un importe con hasta 2 decimales')
const reasonSchema = z.string().trim().min(3, 'Indicá el motivo').max(300)

export const liquidationParamsSchema = z.object({ id: z.uuid() })
export const liquidationItemParamsSchema = z.object({ id: z.uuid(), itemId: z.uuid() })

export const createLiquidationSchema = z
  .object({ providerId: z.uuid(), periodFrom: daySchema, periodTo: daySchema })
  .refine((value) => value.periodTo >= value.periodFrom, { path: ['periodTo'], message: 'El período tiene que terminar después de empezar' })
  .meta({ id: 'CreateLiquidationInput' })

export const resolveItemSchema = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('APPROVED') }),
    z.object({ status: z.literal('DEBITED'), approvedAmount: amountSchema, reason: reasonSchema }),
    z.object({ status: z.literal('REJECTED'), reason: reasonSchema }),
  ])
  .meta({ id: 'ResolveLiquidationItemInput' })

export const payLiquidationSchema = z
  .object({
    amount: amountSchema,
    paidAt: z.iso.datetime().optional(),
    reference: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .meta({ id: 'PayLiquidationInput' })

export const cancelLiquidationSchema = z.object({ reason: reasonSchema }).meta({ id: 'CancelLiquidationInput' })

const statusSchema = z.enum(['DRAFT', 'SUBMITTED', 'PAID', 'CANCELLED']).meta({ id: 'LiquidationStatus' })
const itemStatusSchema = z.enum(['PENDING', 'APPROVED', 'DEBITED', 'REJECTED']).meta({ id: 'LiquidationItemStatus' })

export const liquidationSummarySchema = z
  .object({
    id: z.uuid(),
    provider: z.object({ id: z.uuid(), name: z.string() }),
    periodFrom: z.iso.date(),
    periodTo: z.iso.date(),
    status: statusSchema,
    createdBy: z.string(),
    createdAt: z.iso.datetime(),
    submittedAt: z.iso.datetime().nullable(),
    paidAt: z.iso.datetime().nullable(),
    paidAmount: z.string().nullable(),
    paymentReference: z.string().nullable(),
    cancelReason: z.string().nullable(),
    totals: z.object({
      items: z.number().int(),
      pending: z.number().int(),
      claimed: z.string(),
      approved: z.string().meta({ description: 'Aprobado más lo que quedó después de los débitos' }),
      rejected: z.string(),
      debited: z.string().meta({ description: 'Diferencia que la cobertura descontó en los ítems debitados' }),
    }),
  })
  .meta({ id: 'LiquidationSummary' })

export const liquidationSchema = liquidationSummarySchema
  .extend({
    items: z.array(
      z.object({
        id: z.uuid(),
        status: itemStatusSchema,
        claimedAmount: z.string(),
        approvedAmount: z.string().nullable(),
        reason: z.string().nullable(),
        service: z.object({
          id: z.uuid(),
          performedAt: z.iso.datetime(),
          patient: z.object({ id: z.uuid(), fullName: z.string() }),
          practice: z.object({ code: z.string(), name: z.string() }),
          plan: z.string(),
          affiliateNumber: z.string(),
          authorizationCode: z.string().nullable(),
        }),
      }),
    ),
  })
  .meta({ id: 'Liquidation' })

export type CreateLiquidationInput = z.infer<typeof createLiquidationSchema>
export type ResolveItemInput = z.infer<typeof resolveItemSchema>
export type PayLiquidationInput = z.infer<typeof payLiquidationSchema>
export type LiquidationSummaryDto = z.infer<typeof liquidationSummarySchema>
export type LiquidationDto = z.infer<typeof liquidationSchema>
