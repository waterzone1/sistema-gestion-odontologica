import { z } from 'zod'
import { SURFACES } from '../odontogram/domain/fdi.js'

const moneySchema = z
  .string()
  .trim()
  .regex(/^(?!0+(\.0+)?$)\d{1,12}(\.\d{1,2})?$/, 'Ingresá un importe mayor a cero, con hasta 2 decimales')

const surfaceSchema = z.enum(SURFACES)
const planStatusSchema = z.enum(['DRAFT', 'ACCEPTED', 'COMPLETED', 'CANCELLED']).meta({ id: 'TreatmentPlanStatus' })
const itemStatusSchema = z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).meta({ id: 'TreatmentItemStatus' })

export const planParamsSchema = z.object({ patientId: z.uuid() })
export const planIdParamsSchema = z.object({ patientId: z.uuid(), planId: z.uuid() })
export const itemParamsSchema = z.object({ patientId: z.uuid(), planId: z.uuid(), itemId: z.uuid() })

export const createPlanSchema = z
  .object({
    title: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .meta({ id: 'CreateTreatmentPlanInput' })

export const addItemSchema = z
  .object({
    practiceId: z.uuid(),
    tooth: z.number().int().nullish(),
    surfaces: z.array(surfaceSchema).max(5).default([]),
    notes: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .meta({ id: 'AddTreatmentItemInput' })

export const priceItemSchema = z.object({ price: moneySchema }).meta({ id: 'PriceTreatmentItemInput' })

export const cancelItemSchema = z
  .object({ reason: z.string().trim().min(3, 'Indicá el motivo').max(300) })
  .meta({ id: 'CancelTreatmentItemInput' })

const itemSchema = z.object({
  id: z.uuid(),
  practice: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
  tooth: z.number().int().nullable().meta({ description: 'Nulo para quien no accede a datos clínicos' }),
  surfaces: z.array(surfaceSchema),
  notes: z.string().nullable(),
  agreedPrice: z.string().nullable().meta({ description: 'Nulo si no está cotizado o para quien no ve importes' }),
  catalogPrice: z.string().nullable(),
  priced: z.boolean(),
  status: itemStatusSchema,
  cancelReason: z.string().nullable(),
})

export const treatmentPlanSchema = z
  .object({
    id: z.uuid(),
    title: z.string().nullable(),
    status: planStatusSchema,
    professional: z.object({ id: z.uuid(), displayName: z.string() }),
    acceptedAt: z.iso.datetime().nullable(),
    total: z.string().nullable().meta({ description: 'Suma de los ítems vigentes cotizados. Nulo para quien no ve importes' }),
    createdAt: z.iso.datetime(),
    items: z.array(itemSchema),
  })
  .meta({ id: 'TreatmentPlan' })

export type CreatePlanInput = z.infer<typeof createPlanSchema>
export type AddItemInput = z.infer<typeof addItemSchema>
export type TreatmentPlanDto = z.infer<typeof treatmentPlanSchema>
