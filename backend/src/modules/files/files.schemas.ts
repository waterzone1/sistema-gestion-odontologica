import { z } from 'zod'

const categorySchema = z.enum(['XRAY', 'STUDY', 'PHOTO', 'CONSENT', 'OTHER']).meta({ id: 'ClinicalFileCategory' })

export const filesPatientParamsSchema = z.object({ patientId: z.uuid() })
export const fileParamsSchema = z.object({ patientId: z.uuid(), fileId: z.uuid() })

export const uploadFileQuerySchema = z.object({
  filename: z.string().trim().min(1, 'Falta el nombre del archivo').max(200),
  category: categorySchema,
  description: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((value) => (value ? value : null)),
  clinicalEntryId: z.uuid().optional(),
})

export const listFilesQuerySchema = z.object({
  archived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

export const clinicalFileSchema = z
  .object({
    id: z.uuid(),
    filename: z.string(),
    mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
    size: z.number().int(),
    category: categorySchema,
    description: z.string().nullable(),
    clinicalEntryId: z.uuid().nullable(),
    professional: z.object({ id: z.uuid(), displayName: z.string() }),
    createdAt: z.iso.datetime(),
    archived: z.boolean(),
  })
  .meta({ id: 'ClinicalFile' })

export type UploadFileQuery = z.infer<typeof uploadFileQuerySchema>
export type ClinicalFileDto = z.infer<typeof clinicalFileSchema>
