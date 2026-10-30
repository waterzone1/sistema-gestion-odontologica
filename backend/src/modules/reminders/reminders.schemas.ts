import { z } from 'zod'
import { appointmentStatusSchema } from '../appointments/appointments.schemas.js'

export const reminderParamsSchema = z.object({ id: z.uuid() })
export const remindersQuerySchema = z.object({ date: z.iso.date('Fecha inválida') })
export const generateRemindersSchema = z
  .object({ date: z.iso.date('Fecha inválida').optional().meta({ description: 'Por defecto, la anticipación configurada (mañana si no se cambió)' }) })
  .meta({ id: 'GenerateRemindersInput' })

export const reminderSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['PENDING', 'SENT', 'CONFIRMED', 'CANCELLED', 'FAILED']),
    phone: z.string().nullable(),
    message: z.string(),
    whatsappUrl: z.string().nullable().meta({ description: 'Link para abrir WhatsApp con el mensaje escrito' }),
    failureReason: z.string().nullable(),
    sentAt: z.iso.datetime().nullable(),
    confirmedAt: z.iso.datetime().nullable(),
    patient: z.object({ id: z.uuid(), fullName: z.string() }),
    appointment: z.object({
      id: z.uuid(),
      status: appointmentStatusSchema,
      startsAt: z.iso.datetime(),
      professional: z.string(),
      branch: z.string(),
    }),
  })
  .meta({ id: 'Reminder' })

export const remindersDaySchema = z
  .object({ date: z.iso.date(), reminders: z.array(reminderSchema) })
  .meta({ id: 'RemindersDay' })

export type ReminderDto = z.infer<typeof reminderSchema>
export type RemindersDayDto = z.infer<typeof remindersDaySchema>
