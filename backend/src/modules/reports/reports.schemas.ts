import { z } from 'zod'
import { currencySchema, paymentMethodSchema } from '../billing/billing.schemas.js'

export const reportQuerySchema = z
  .object({
    from: z.iso.date('Fecha inválida'),
    to: z.iso.date('Fecha inválida'),
    branchId: z.uuid().optional(),
    professionalId: z.uuid().optional(),
  })
  .refine((value) => value.to >= value.from, { path: ['to'], message: 'La fecha final tiene que ser posterior a la inicial' })
  .refine((value) => (new Date(value.to).getTime() - new Date(value.from).getTime()) / 86_400_000 <= 366, {
    path: ['to'],
    message: 'El período puede ser de hasta un año',
  })

const statusCounts = z.object({
  total: z.number().int(),
  scheduled: z.number().int(),
  confirmed: z.number().int(),
  attended: z.number().int(),
  noShow: z.number().int(),
  cancelled: z.number().int(),
})

export const appointmentsReportSchema = z
  .object({
    totals: statusCounts,
    byProfessional: z.array(statusCounts.extend({ professional: z.object({ id: z.uuid(), displayName: z.string() }) })),
  })
  .meta({ id: 'AppointmentsReport' })

export const collectionsReportSchema = z
  .object({
    totalArs: z.string(),
    byDay: z.array(z.object({ date: z.iso.date(), count: z.number().int(), amountArs: z.string() })),
    byMethod: z.array(
      z.object({
        method: paymentMethodSchema,
        currency: currencySchema,
        count: z.number().int(),
        originalTotal: z.string(),
        amountArs: z.string(),
      }),
    ),
  })
  .meta({ id: 'CollectionsReport' })

export const servicesReportSchema = z
  .object({
    byProfessional: z.array(
      z.object({
        professional: z.object({ id: z.uuid(), displayName: z.string() }),
        count: z.number().int(),
        patientAmount: z.string(),
        coverageAmount: z.string(),
      }),
    ),
    byPractice: z.array(
      z.object({
        practice: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
        count: z.number().int(),
        patientAmount: z.string(),
        coverageAmount: z.string(),
      }),
    ),
  })
  .meta({ id: 'ServicesReport' })

export type ReportQuery = z.infer<typeof reportQuerySchema>
export type AppointmentsReportDto = z.infer<typeof appointmentsReportSchema>
export type CollectionsReportDto = z.infer<typeof collectionsReportSchema>
export type ServicesReportDto = z.infer<typeof servicesReportSchema>
