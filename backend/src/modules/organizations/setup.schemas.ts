import { z } from 'zod'
import { sessionResponseSchema } from '../auth/auth.schemas.js'
import { displayNameSchema, usernameSchema } from '../users/users.schemas.js'

const timezoneSchema = z
  .string()
  .default('America/Argentina/Buenos_Aires')
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat('es-AR', { timeZone: tz })
        return true
      } catch {
        return false
      }
    },
    { message: 'Zona horaria inválida' },
  )

const optionalText = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()

export const setupSchema = z
  .object({
    setupToken: z.string().min(1, 'Ingresá el código de instalación').max(200),
    organization: z.object({
      name: z.string().trim().min(2, 'Ingresá el nombre de la organización').max(120),
      timezone: timezoneSchema,
    }),
    branch: z.object({
      name: z.string().trim().min(2, 'Ingresá el nombre de la sede').max(120),
      address: optionalText,
      phone: optionalText,
    }),
    admin: z.object({
      username: usernameSchema,
      displayName: displayNameSchema,
      password: z.string().max(256),
    }),
  })
  .meta({ id: 'SetupInput' })

export const setupStatusSchema = z.object({ needsSetup: z.boolean() }).meta({ id: 'SetupStatus' })

export const setupResponseSchema = sessionResponseSchema

export type SetupInput = z.infer<typeof setupSchema>
