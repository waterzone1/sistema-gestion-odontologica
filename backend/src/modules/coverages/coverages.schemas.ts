import { z } from 'zod'

const kindSchema = z.enum(['OBRA_SOCIAL', 'PREPAGA', 'OTHER']).meta({ id: 'CoverageKind' })
const nameSchema = z.string().trim().min(2, 'Ingresá el nombre').max(80)
const daySchema = z.iso.date('Fecha inválida')
const amountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Ingresá un importe con hasta 2 decimales')
const optionalNotes = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((value) => (value ? value : null))

export const idParamsSchema = z.object({ id: z.uuid() })
export const patientParamsSchema = z.object({ patientId: z.uuid() })
export const patientCoverageParamsSchema = z.object({ patientId: z.uuid(), coverageId: z.uuid() })

export const createProviderSchema = z.object({ name: nameSchema, kind: kindSchema }).meta({ id: 'CreateCoverageProviderInput' })

export const updateProviderSchema = z
  .object({ name: nameSchema, kind: kindSchema, active: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios para guardar' })
  .meta({ id: 'UpdateCoverageProviderInput' })

export const createPlanSchema = z
  .object({
    name: nameSchema,
    code: z
      .string()
      .trim()
      .max(30)
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .meta({ id: 'CreateCoveragePlanInput' })

export const updatePlanSchema = z
  .object({ name: nameSchema, active: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios para guardar' })
  .meta({ id: 'UpdateCoveragePlanInput' })

const agreementItemSchema = z
  .object({
    practiceId: z.uuid(),
    insurerAmount: amountSchema.meta({ description: 'Lo que paga la cobertura' }),
    patientCopay: amountSchema.meta({ description: 'Coseguro: lo que paga el paciente' }),
    requiresAuthorization: z.boolean().default(false),
  })
  .refine((item) => Number(item.insurerAmount) + Number(item.patientCopay) > 0, {
    message: 'La práctica tiene que tener algún importe',
  })

const itemsSchema = z
  .array(agreementItemSchema)
  .max(200)
  .refine((items) => new Set(items.map((i) => i.practiceId)).size === items.length, {
    message: 'Hay prácticas repetidas en el convenio',
  })

export const createAgreementSchema = z
  .object({
    validFrom: daySchema,
    validTo: daySchema.nullish(),
    notes: optionalNotes,
    items: itemsSchema.min(1, 'Agregá al menos una práctica'),
  })
  .refine((value) => !value.validTo || value.validTo >= value.validFrom, {
    path: ['validTo'],
    message: 'La vigencia tiene que terminar después de empezar',
  })
  .meta({ id: 'CreateAgreementInput' })

export const updateAgreementSchema = z
  .object({
    validTo: daySchema.nullable(),
    notes: optionalNotes,
    items: itemsSchema.min(1, 'Agregá al menos una práctica'),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios para guardar' })
  .meta({ id: 'UpdateAgreementInput' })

export const createPatientCoverageSchema = z
  .object({
    planId: z.uuid(),
    affiliateNumber: z.string().trim().min(1, 'Ingresá el número de afiliado').max(40),
    validFrom: daySchema,
    validTo: daySchema.nullish(),
    notes: optionalNotes,
    primary: z.boolean().default(true),
  })
  .refine((value) => !value.validTo || value.validTo >= value.validFrom, {
    path: ['validTo'],
    message: 'La vigencia tiene que terminar después de empezar',
  })
  .meta({ id: 'CreatePatientCoverageInput' })

export const coverageQuoteQuerySchema = z.object({
  practiceId: z.uuid(),
  date: daySchema.optional(),
})

const planSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  active: z.boolean(),
})

export const providerSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    kind: kindSchema,
    active: z.boolean(),
    plans: z.array(planSchema),
  })
  .meta({ id: 'CoverageProvider' })

export const agreementSchema = z
  .object({
    id: z.uuid(),
    planId: z.uuid(),
    validFrom: z.iso.date(),
    validTo: z.iso.date().nullable(),
    notes: z.string().nullable(),
    items: z.array(
      z.object({
        practice: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
        insurerAmount: z.string(),
        patientCopay: z.string(),
        requiresAuthorization: z.boolean(),
      }),
    ),
  })
  .meta({ id: 'Agreement' })

export const patientCoverageSchema = z
  .object({
    id: z.uuid(),
    provider: z.object({ id: z.uuid(), name: z.string(), kind: kindSchema }),
    plan: z.object({ id: z.uuid(), name: z.string() }),
    affiliateNumber: z.string(),
    validFrom: z.iso.date(),
    validTo: z.iso.date().nullable(),
    notes: z.string().nullable(),
    primary: z.boolean(),
    archived: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'PatientCoverage' })

export const coverageQuoteSchema = z
  .object({
    coverage: patientCoverageSchema.pick({ id: true, provider: true, plan: true, affiliateNumber: true }).nullable(),
    insurerAmount: z.string().nullable(),
    patientCopay: z.string().nullable(),
    requiresAuthorization: z.boolean(),
  })
  .meta({ id: 'CoverageQuote' })

export type CreateProviderInput = z.infer<typeof createProviderSchema>
export type UpdateProviderInput = z.infer<typeof updateProviderSchema>
export type CreatePlanInput = z.infer<typeof createPlanSchema>
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>
export type CreateAgreementInput = z.infer<typeof createAgreementSchema>
export type UpdateAgreementInput = z.infer<typeof updateAgreementSchema>
export type CreatePatientCoverageInput = z.infer<typeof createPatientCoverageSchema>
export type ProviderDto = z.infer<typeof providerSchema>
export type AgreementDto = z.infer<typeof agreementSchema>
export type PatientCoverageDto = z.infer<typeof patientCoverageSchema>
export type CoverageQuoteDto = z.infer<typeof coverageQuoteSchema>
