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

const profileText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()

export const saveClinicalProfileSchema = z
  .object({
    alerts: profileText(300).meta({ description: 'Alertas breves que se muestran en la ficha' }),
    allergies: profileText(1000),
    medications: profileText(1000),
    background: profileText(4000),
  })
  .meta({ id: 'SaveClinicalProfileInput' })

const profileFields = {
  alerts: z.string().nullable(),
  allergies: z.string().nullable(),
  medications: z.string().nullable(),
  background: z.string().nullable(),
}

export const clinicalProfileSchema = z
  .object({
    current: z
      .object({
        ...profileFields,
        professional: z.object({ id: z.uuid(), displayName: z.string() }),
        updatedAt: z.iso.datetime(),
      })
      .nullable(),
    versions: z.number().int().meta({ description: 'Cantidad de versiones guardadas' }),
  })
  .meta({ id: 'ClinicalProfile' })

export type ClinicalEntryDto = z.infer<typeof clinicalEntrySchema>
export type SaveClinicalProfileInput = z.infer<typeof saveClinicalProfileSchema>
export type ClinicalProfileDto = z.infer<typeof clinicalProfileSchema>
export type CreateClinicalEntryInput = z.infer<typeof createClinicalEntrySchema>
export type CorrectClinicalEntryInput = z.infer<typeof correctClinicalEntrySchema>
