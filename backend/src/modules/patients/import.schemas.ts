import { z } from 'zod'

export const importBodySchema = z
  .object({ csv: z.string().min(1, 'El archivo está vacío').max(1_000_000, 'El archivo supera 1 MB') })
  .meta({ id: 'PatientImportInput' })

export const importPreviewSchema = z
  .object({
    rows: z.array(
      z.object({
        line: z.number().int(),
        firstName: z.string(),
        lastName: z.string(),
        documentType: z.string(),
        documentNumber: z.string(),
        birthDate: z.string(),
        errors: z.array(z.string()),
      }),
    ),
    valid: z.number().int(),
    invalid: z.number().int(),
  })
  .meta({ id: 'PatientImportPreview' })

export const importResultSchema = z
  .object({ created: z.number().int(), skipped: z.number().int() })
  .meta({ id: 'PatientImportResult' })

export type ImportPreviewDto = z.infer<typeof importPreviewSchema>
export type ImportResultDto = z.infer<typeof importResultSchema>
