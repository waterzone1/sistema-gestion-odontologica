import { z } from 'zod'

const contentSchema = z
  .string()
  .trim()
  .min(3, 'Escribí la nota clínica')
  .max(10000, 'La nota no puede superar los 10.000 caracteres')

export const clinicalPatientParamsSchema = z.object({ patientId: z.uuid() })

export const clinicalEntryParamsSchema = z.object({ patientId: z.uuid(), entryId: z.uuid() })

export const createClinicalEntrySchema = z
  .object({
    content: contentSchema,
    appointmentId: z.uuid().nullish(),
  })
  .meta({ id: 'CreateClinicalEntryInput' })

export const correctClinicalEntrySchema = z
  .object({ content: contentSchema })
  .meta({ id: 'CorrectClinicalEntryInput' })

export const clinicalEntrySchema = z
  .object({
    id: z.uuid(),
    entryType: z.enum(['EVOLUTION', 'CORRECTION']),
    content: z.string(),
    correctionOfId: z.uuid().nullable(),
    appointmentId: z.uuid().nullable(),
    professional: z.object({ id: z.uuid(), displayName: z.string() }),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'ClinicalEntry' })

export type ClinicalEntryDto = z.infer<typeof clinicalEntrySchema>
export type CreateClinicalEntryInput = z.infer<typeof createClinicalEntrySchema>
export type CorrectClinicalEntryInput = z.infer<typeof correctClinicalEntrySchema>
