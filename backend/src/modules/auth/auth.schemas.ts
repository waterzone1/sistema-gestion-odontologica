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
