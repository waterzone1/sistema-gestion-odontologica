import { z } from 'zod'
import { addDays, fromLocal, toLocal } from '../../availability/domain/availability.js'

const BACKUP_SCHEDULES = ['EVERY_6H', 'EVERY_12H', 'DAILY', 'WEEKLY'] as const
type BackupSchedule = (typeof BACKUP_SCHEDULES)[number]

export const backupSettingsSchema = z
  .object({
    schedule: z.enum(BACKUP_SCHEDULES).meta({ description: 'Cada 6 h, cada 12 h, una vez por día o una vez por semana' }),
    hour: z.number().int().min(0).max(23).meta({ description: 'Hora de inicio (en la zona del consultorio)' }),
    weekday: z.number().int().min(1).max(7).meta({ description: 'Día de la semana para el semanal: 1 lunes … 7 domingo' }),
    paused: z.boolean(),
    keepDaily: z.number().int().min(1).max(60),
    keepWeekly: z.number().int().min(0).max(52),
    keepManual: z.number().int().min(1).max(50),
  })
  .meta({ id: 'BackupSettings' })

export const TEMPLATE_VARIABLES = ['nombre', 'fecha', 'hora', 'profesional', 'sede', 'consultorio'] as const

export const reminderSettingsSchema = z
  .object({
    daysAhead: z.number().int().min(1).max(3).meta({ description: 'Con cuántos días de anticipación se generan los recordatorios' }),
    template: z
      .string()
      .trim()
      .min(20, 'El mensaje es demasiado corto')
      .max(600, 'Máximo 600 caracteres')
      .refine((text) => [...text.matchAll(/\{(\w+)\}/g)].every((m) => (TEMPLATE_VARIABLES as readonly string[]).includes(m[1] ?? '')), {
        message: `Solo se pueden usar ${TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(', ')}`,
      })
      .meta({ description: 'Texto del mensaje con variables entre llaves' }),
  })
  .meta({ id: 'ReminderSettings' })

export const fileSettingsSchema = z
  .object({ maxMb: z.number().int().min(1).max(200).meta({ description: 'Tamaño máximo de cada archivo clínico, en MB' }) })
  .meta({ id: 'FileSettings' })

const SESSION_IDLE_OPTIONS = [15, 30, 60, 120, 240, 480, 720] as const

export const sessionSettingsSchema = z
  .object({
    idleMinutes: z
      .number()
      .int()
      .refine((value) => (SESSION_IDLE_OPTIONS as readonly number[]).includes(value), 'Elegí uno de los valores ofrecidos')
      .meta({ description: 'Minutos sin actividad antes de cerrar la sesión' }),
  })
  .meta({ id: 'SessionSettings' })

const sections = {
  backups: backupSettingsSchema,
  reminders: reminderSettingsSchema,
  files: fileSettingsSchema,
  sessions: sessionSettingsSchema,
}

export const organizationSettingsSchema = z.object(sections).meta({ id: 'OrganizationSettings' })
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>

export const DEFAULT_TEMPLATE =
  'Hola {nombre}, te recordamos tu turno del {fecha} a las {hora} con {profesional} en {consultorio} ({sede}). Por favor confirmá tu asistencia respondiendo este mensaje. ¡Gracias!'

export const DEFAULT_SETTINGS: OrganizationSettings = {
  backups: { schedule: 'DAILY', hour: 3, weekday: 7, paused: false, keepDaily: 7, keepWeekly: 4, keepManual: 10 },
  reminders: { daysAhead: 1, template: DEFAULT_TEMPLATE },
  files: { maxMb: 20 },
  sessions: { idleMinutes: 480 },
}

export function readSettings(stored: unknown, defaults: OrganizationSettings = DEFAULT_SETTINGS): OrganizationSettings {
  const source = stored !== null && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
  const read = <K extends keyof OrganizationSettings>(key: K): OrganizationSettings[K] => {
    const parsed = sections[key].safeParse(source[key])
    return (parsed.success ? parsed.data : defaults[key]) as OrganizationSettings[K]
  }
  return { backups: read('backups'), reminders: read('reminders'), files: read('files'), sessions: read('sessions') }
}

export function renderTemplate(template: string, values: Record<(typeof TEMPLATE_VARIABLES)[number], string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key as keyof typeof values] : match))
}

const STEP_HOURS: Record<Exclude<BackupSchedule, 'WEEKLY'>, number> = { EVERY_6H: 6, EVERY_12H: 12, DAILY: 24 }

function slotsOfDay(day: string, settings: Pick<OrganizationSettings['backups'], 'schedule' | 'hour' | 'weekday'>, timeZone: string): Date[] {
  if (settings.schedule === 'WEEKLY') {
    const weekday = ((new Date(`${day}T12:00:00.000Z`).getUTCDay() + 6) % 7) + 1
    return weekday === settings.weekday ? [fromLocal(day, settings.hour * 60, timeZone)] : []
  }
  const step = STEP_HOURS[settings.schedule]
  const first = settings.hour % step
  const slots: Date[] = []
  for (let hour = first; hour < 24; hour += step) slots.push(fromLocal(day, hour * 60, timeZone))
  return slots
}

export function backupSlots(settings: OrganizationSettings['backups'], now: Date, timeZone: string): { latest: Date | null; next: Date | null } {
  if (settings.paused) return { latest: null, next: null }
  const today = toLocal(now, timeZone).day
  const slots = Array.from({ length: 15 }, (_, i) => slotsOfDay(addDays(today, i - 7), settings, timeZone)).flat()
  const past = slots.filter((slot) => slot.getTime() <= now.getTime())
  const future = slots.filter((slot) => slot.getTime() > now.getTime())
  return {
    latest: past.length > 0 ? new Date(Math.max(...past.map((slot) => slot.getTime()))) : null,
    next: future.length > 0 ? new Date(Math.min(...future.map((slot) => slot.getTime()))) : null,
  }
}
