import { z } from 'zod'

export const backupParamsSchema = z.object({ id: z.string().regex(/^backup-\d{8}-\d{6}-[0-9a-f]{6}$/, 'Backup inválido') })

export const restoreSchema = z
  .object({
    confirmation: z.literal('RESTAURAR', { error: 'Escribí RESTAURAR para confirmar' }),
  })
  .meta({ id: 'RestoreBackupInput' })

const countsSchema = z.object({
  patients: z.number().int(),
  appointments: z.number().int(),
  clinicalEntries: z.number().int(),
  services: z.number().int(),
  payments: z.number().int(),
  clinicalFiles: z.number().int(),
})

export const backupRecordSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['SCHEDULED', 'MANUAL']),
    status: z.enum(['RUNNING', 'SUCCEEDED', 'FAILED']),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    size: z.number().int().nullable(),
    sha256: z.string().nullable(),
    schemaVersion: z.string().nullable(),
    counts: countsSchema.nullable(),
    createdBy: z.string().nullable(),
    error: z.string().nullable(),
  })
  .meta({ id: 'BackupRecord' })

export const backupStatusSchema = z
  .object({
    maintenance: z.boolean(),
    running: z.string().nullable(),
    lastSuccess: z.iso.datetime().nullable(),
    nextScheduled: z.iso.datetime().nullable(),
    toolsAvailable: z.boolean(),
  })
  .meta({ id: 'BackupStatus' })

export const restoreResultSchema = z
  .object({
    id: z.string(),
    restoredAt: z.iso.datetime(),
    counts: countsSchema,
  })
  .meta({ id: 'RestoreResult' })

export type BackupRecord = z.infer<typeof backupRecordSchema>
export type BackupCounts = z.infer<typeof countsSchema>
export type BackupStatusDto = z.infer<typeof backupStatusSchema>
export type RestoreResultDto = z.infer<typeof restoreResultSchema>
