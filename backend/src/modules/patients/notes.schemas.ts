import { z } from 'zod'

export const notesPatientParamsSchema = z.object({ patientId: z.uuid() })
export const noteParamsSchema = z.object({ patientId: z.uuid(), noteId: z.uuid() })

export const createNoteSchema = z
  .object({ content: z.string().trim().min(1, 'Escribí el mensaje').max(1000) })
  .meta({ id: 'CreatePatientNoteInput' })

export const listNotesQuerySchema = z.object({
  archived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

export const patientNoteSchema = z
  .object({
    id: z.uuid(),
    content: z.string(),
    author: z.object({ id: z.uuid(), displayName: z.string() }),
    createdAt: z.iso.datetime(),
    archivedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'PatientNote' })

export type CreateNoteInput = z.infer<typeof createNoteSchema>
export type PatientNoteDto = z.infer<typeof patientNoteSchema>
