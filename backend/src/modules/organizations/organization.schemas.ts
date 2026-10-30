import { z } from 'zod'
import { backupSettingsSchema, fileSettingsSchema, organizationSettingsSchema, reminderSettingsSchema, sessionSettingsSchema } from './domain/settings.js'

export const organizationModulesSchema = z
  .object({ coverages: z.boolean().meta({ description: 'Coberturas, convenios y liquidaciones a obras sociales y prepagas' }) })
  .meta({ id: 'OrganizationModules' })

const timeZoneSchema = z
  .string()
  .trim()
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('es-AR', { timeZone: value })
      return true
    } catch {
      return false
    }
  }, 'Zona horaria inválida')

export const updateOrganizationSchema = z
  .object({ name: z.string().trim().min(2, 'Ingresá el nombre').max(120), timezone: timeZoneSchema })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios para guardar' })
  .meta({ id: 'UpdateOrganizationInput' })

export const updateSettingsSchema = z
  .object({
    backups: backupSettingsSchema,
    reminders: reminderSettingsSchema,
    files: fileSettingsSchema,
    sessions: sessionSettingsSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios para guardar' })
  .meta({ id: 'UpdateOrganizationSettingsInput' })

export const organizationSchema = z
  .object({
    name: z.string(),
    timezone: z.string(),
    modules: organizationModulesSchema,
    settings: organizationSettingsSchema,
    limits: z.object({ fileMaxMb: z.number().int().meta({ description: 'Tope del servidor para archivos clínicos' }) }),
  })
  .meta({ id: 'Organization' })

export type OrganizationModules = z.infer<typeof organizationModulesSchema>
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
export type OrganizationDto = z.infer<typeof organizationSchema>
