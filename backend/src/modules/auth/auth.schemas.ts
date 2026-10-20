import { z } from 'zod'
import { PERMISSIONS } from '../users/domain/permissions.js'
import { roleSchema } from '../users/users.schemas.js'

export const loginSchema = z
  .object({
    username: z.string().trim().toLowerCase().min(1, 'Ingresá tu usuario').max(64),
    password: z.string().min(1, 'Ingresá tu contraseña').max(256),
  })
  .meta({ id: 'LoginInput' })

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().max(256),
  })
  .meta({ id: 'ChangePasswordInput' })

const themeSchema = z.enum(['SYSTEM', 'LIGHT', 'DARK']).meta({ id: 'ThemePreference' })

const pathSchema = z.string().regex(/^\/[a-z/-]{0,60}$/, 'Ruta inválida')

const preferenceFields = {
  menuOrder: z.array(pathSchema).max(20).meta({ description: 'Orden del menú, por ruta. Lo que no figura va al final' }),
  homePage: pathSchema.meta({ description: 'Pantalla que se abre al entrar' }),
  agendaView: z.enum(['timeGridWeek', 'timeGridDay', 'listWeek']),
  agendaStartHour: z.number().int().min(0).max(23),
  agendaEndHour: z.number().int().min(1).max(24),
  agendaSlotMinutes: z.union([z.literal(15), z.literal(30)]),
  showSaturday: z.boolean(),
  showSunday: z.boolean(),
}

const partialPreferencesSchema = z.object(preferenceFields).partial()

const DEFAULT_PREFERENCES: z.infer<typeof userPreferencesSchema> = {
  menuOrder: [],
  homePage: '/dashboard',
  agendaView: 'timeGridWeek',
  agendaStartHour: 7,
  agendaEndHour: 21,
  agendaSlotMinutes: 30,
  showSaturday: true,
  showSunday: true,
}

const userPreferencesSchema = z.object(preferenceFields).meta({ id: 'UserPreferences' })

export const preferencesSchema = z
  .object({
    theme: themeSchema.optional(),
    preferences: partialPreferencesSchema.optional(),
  })
  .refine((value) => value.theme !== undefined || value.preferences !== undefined, { message: 'No hay cambios para guardar' })
  .meta({ id: 'PreferencesInput' })

const sessionUserSchema = z
  .object({
    id: z.uuid(),
    username: z.string(),
    displayName: z.string(),
    roles: z.array(roleSchema),
    permissions: z.array(z.enum(PERMISSIONS)),
    branchIds: z.array(z.uuid()),
    mustChangePassword: z.boolean(),
    onboardingCompleted: z.boolean(),
    theme: themeSchema,
    preferences: userPreferencesSchema,
  })
  .meta({ id: 'SessionUser' })

export const sessionResponseSchema = z
  .object({
    user: sessionUserSchema,
    csrfToken: z.string().meta({ description: 'Enviar en el header X-CSRF-Token en toda escritura' }),
  })
  .meta({ id: 'SessionResponse' })

export type SessionResponse = z.infer<typeof sessionResponseSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type PreferencesInput = z.infer<typeof preferencesSchema>
export type UserPreferences = z.infer<typeof userPreferencesSchema>

export function readPreferences(stored: unknown): UserPreferences {
  const source = stored !== null && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
  const valid = Object.fromEntries(
    Object.entries(preferenceFields).flatMap(([key, schema]) => {
      const parsed = schema.safeParse(source[key])
      return parsed.success ? [[key, parsed.data]] : []
    }),
  )
  return { ...DEFAULT_PREFERENCES, ...valid }
}
