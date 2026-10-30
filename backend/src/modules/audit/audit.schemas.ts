import { z } from 'zod'

export const auditQuerySchema = z
  .object({
    from: z.iso.date('Fecha inválida').optional(),
    to: z.iso.date('Fecha inválida').optional(),
    action: z.string().trim().max(60).optional(),
    entityType: z.string().trim().max(60).optional(),
    actorUserId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((value) => !value.from || !value.to || value.to >= value.from, {
    path: ['to'],
    message: 'La fecha final tiene que ser posterior a la inicial',
  })

export const auditListSchema = z
  .object({
    items: z.array(
      z.object({
        id: z.uuid(),
        action: z.string(),
        entityType: z.string(),
        entityId: z.string().nullable(),
        actor: z.object({ id: z.uuid(), displayName: z.string() }).nullable(),
        subject: z.string().nullable().meta({ description: 'A quién o a qué afecta, en palabras: paciente, turno, práctica, usuario' }),
        metadata: z.record(z.string(), z.unknown()).nullable(),
        createdAt: z.iso.datetime(),
      }),
    ),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .meta({ id: 'AuditList' })

export type AuditQuery = z.infer<typeof auditQuerySchema>
export type AuditListDto = z.infer<typeof auditListSchema>
