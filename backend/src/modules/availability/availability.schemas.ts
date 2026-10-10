import { z } from 'zod'

const timeSchema = z
  .string()
  .regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Usá el formato hh:mm (24 h)')

const exceptionTypeSchema = z.enum(['BLOCK', 'VACATION', 'ABSENCE', 'EXTRA']).meta({ id: 'AvailabilityExceptionType' })

const instantSchema = z.iso.datetime({ offset: true })

export const professionalAvailabilityParamsSchema = z.object({ professionalId: z.uuid() })
export const exceptionParamsSchema = z.object({ professionalId: z.uuid(), exceptionId: z.uuid() })

export const replaceRulesSchema = z
  .object({
    rules: z
      .array(
        z.object({
          branchId: z.uuid(),
          weekday: z.number().int().min(1).max(7).meta({ description: '1 = lunes … 7 = domingo' }),
          start: timeSchema,
          end: timeSchema,
        }),
      )
      .max(100),
  })
  .meta({ id: 'ReplaceAvailabilityRulesInput' })

const MAX_EXCEPTION_DAYS = 366
const DAY_MS = 86_400_000

export const createExceptionSchema = z
  .object({
    type: exceptionTypeSchema,
    branchId: z.uuid().nullable().optional(),
    startsAt: instantSchema,
    endsAt: instantSchema,
    reason: z.string().trim().min(3, 'Indicá el motivo').max(200),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    path: ['endsAt'],
    message: 'El final tiene que ser posterior al inicio',
  })
  .refine((value) => new Date(value.endsAt).getTime() - new Date(value.startsAt).getTime() <= MAX_EXCEPTION_DAYS * DAY_MS, {
    path: ['endsAt'],
    message: 'Una excepción no puede durar más de un año',
  })
  .refine((value) => value.type !== 'EXTRA' || !!value.branchId, {
    path: ['branchId'],
    message: 'Un horario extraordinario necesita una sede',
  })
  .meta({ id: 'CreateAvailabilityExceptionInput' })

export const agendaAvailabilityQuerySchema = z
  .object({
    from: instantSchema,
    to: instantSchema,
    branchId: z.uuid(),
    professionalId: z.uuid().optional(),
  })
  .refine((value) => new Date(value.to) > new Date(value.from), { path: ['to'], message: 'Rango inválido' })
  .refine((value) => new Date(value.to).getTime() - new Date(value.from).getTime() <= 62 * DAY_MS, {
    path: ['to'],
    message: 'El rango es demasiado grande: hasta 62 días',
  })

const availabilityRuleSchema = z
  .object({
    id: z.uuid(),
    branchId: z.uuid(),
    weekday: z.number().int(),
    start: z.string().meta({ example: '09:00' }),
    end: z.string().meta({ example: '13:00' }),
  })
  .meta({ id: 'AvailabilityRule' })

const availabilityExceptionSchema = z
  .object({
    id: z.uuid(),
    type: exceptionTypeSchema,
    branchId: z.uuid().nullable(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: z.string(),
  })
  .meta({ id: 'AvailabilityException' })

export const professionalAvailabilitySchema = z
  .object({
    rules: z.array(availabilityRuleSchema),
    exceptions: z.array(availabilityExceptionSchema),
  })
  .meta({ id: 'ProfessionalAvailability' })

export const exceptionResultSchema = z
  .object({
    exception: availabilityExceptionSchema,
    conflicts: z.array(
      z.object({ id: z.uuid(), startsAt: z.iso.datetime(), patient: z.string() }),
    ).meta({ description: 'Turnos activos que quedan dentro de un bloqueo y conviene reprogramar' }),
  })
  .meta({ id: 'AvailabilityExceptionResult' })

const intervalSchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  branchId: z.uuid().nullable(),
})

export const agendaAvailabilitySchema = z
  .array(
    z.object({
      professionalId: z.uuid(),
      available: z.array(intervalSchema),
      blocked: z.array(intervalSchema.extend({ type: exceptionTypeSchema, reason: z.string() })),
    }),
  )
  .meta({ id: 'AgendaAvailability' })

export type ReplaceRulesInput = z.infer<typeof replaceRulesSchema>
export type CreateExceptionInput = z.infer<typeof createExceptionSchema>
export type AgendaAvailabilityQuery = z.infer<typeof agendaAvailabilityQuerySchema>
export type ProfessionalAvailabilityDto = z.infer<typeof professionalAvailabilitySchema>
export type ExceptionResultDto = z.infer<typeof exceptionResultSchema>
export type AgendaAvailabilityDto = z.infer<typeof agendaAvailabilitySchema>
export type AvailabilityExceptionDto = z.infer<typeof availabilityExceptionSchema>
