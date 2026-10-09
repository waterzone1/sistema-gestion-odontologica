import { z } from 'zod'

const appointmentStatusSchema = z
  .enum(['SCHEDULED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED'])
  .meta({ id: 'AppointmentStatus' })

const instantSchema = z.iso.datetime({ offset: true })

const notesSchema = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional()

export const appointmentIdParamsSchema = z.object({ id: z.uuid() })

const acknowledgeSchema = z
  .boolean()
  .optional()
  .meta({ description: 'Confirma que se da el turno aunque esté fuera del horario del profesional o con una práctica que no tiene habilitada' })

const overrideSchema = z
  .object({ reason: z.string().trim().min(5, 'Explicá por qué se da el turno fuera de horario').max(300) })
  .optional()
  .meta({ description: 'Solo administración: permite dar el turno aunque el profesional esté de vacaciones, ausente o bloqueado. Nunca permite superponer turnos' })

export const createAppointmentSchema = z
  .object({
    patientId: z.uuid(),
    professionalId: z.uuid(),
    branchId: z.uuid(),
    practiceId: z.uuid().nullable().optional(),
    startsAt: instantSchema,
    endsAt: instantSchema,
    notes: notesSchema,
    override: overrideSchema,
    acknowledgeWarnings: acknowledgeSchema,
  })
  .meta({ id: 'CreateAppointmentInput' })

export const updateAppointmentSchema = z
  .object({
    professionalId: z.uuid(),
    branchId: z.uuid(),
    practiceId: z.uuid().nullable(),
    startsAt: instantSchema,
    endsAt: instantSchema,
    notes: notesSchema,
    override: overrideSchema,
    acknowledgeWarnings: acknowledgeSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios para guardar' })
  .meta({ id: 'UpdateAppointmentInput' })

export const changeStatusSchema = z
  .object({
    status: appointmentStatusSchema.exclude(['SCHEDULED']),
    cancellationReason: z.string().trim().min(3, 'Indicá el motivo').max(200).optional(),
  })
  .refine((value) => value.status !== 'CANCELLED' || !!value.cancellationReason, {
    path: ['cancellationReason'],
    message: 'Indicá el motivo de la cancelación',
  })
  .meta({ id: 'ChangeAppointmentStatusInput' })

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_RANGE_DAYS = 62
const MAX_PATIENT_RANGE_DAYS = 366

export const listAppointmentsQuerySchema = z
  .object({
    from: instantSchema,
    to: instantSchema,
    branchId: z.uuid().optional(),
    professionalId: z.uuid().optional(),
    patientId: z.uuid().optional(),
    status: appointmentStatusSchema.optional(),
  })
  .refine((value) => new Date(value.to) > new Date(value.from), {
    path: ['to'],
    message: 'La fecha final tiene que ser posterior a la inicial',
  })
  .refine(
    (value) => {
      const days = (new Date(value.to).getTime() - new Date(value.from).getTime()) / DAY_MS
      return days <= (value.patientId ? MAX_PATIENT_RANGE_DAYS : MAX_RANGE_DAYS)
    },
    { path: ['to'], message: 'El rango es demasiado grande: hasta 62 días (o 366 si se filtra por paciente)' },
  )

export const appointmentSchema = z
  .object({
    id: z.uuid(),
    status: appointmentStatusSchema,
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    notes: z.string().nullable(),
    cancellationReason: z.string().nullable(),
    branch: z.object({ id: z.uuid(), name: z.string() }),
    patient: z.object({ id: z.uuid(), fullName: z.string(), phone: z.string().nullable() }),
    professional: z.object({ id: z.uuid(), userId: z.uuid(), displayName: z.string() }),
    practice: z.object({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
    hasClinicalNote: z
      .boolean()
      .nullable()
      .meta({ description: 'Si el turno tiene una nota clínica. Nulo para quien no accede a datos clínicos' }),
    availabilityOverride: z.boolean(),
    overrideReason: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Appointment' })

export type AppointmentDto = z.infer<typeof appointmentSchema>
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>
