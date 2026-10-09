import { z } from 'zod'
import { ROLES } from './domain/permissions.js'

export const roleSchema = z.enum(ROLES).meta({ id: 'Role' })

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Debe tener al menos 3 caracteres')
  .max(64)
  .regex(/^[a-z0-9._-]+$/, 'Solo letras, números, punto, guion y guion bajo')

export const displayNameSchema = z.string().trim().min(2, 'Ingresá el nombre').max(120)

export const idParamsSchema = z.object({ id: z.uuid() })

export const createUserSchema = z
  .object({
    username: usernameSchema,
    displayName: displayNameSchema,
    password: z.string().max(256),
    roles: z.array(roleSchema).min(1, 'Elegí al menos un rol').max(ROLES.length),
    branchIds: z.array(z.uuid()).max(50).default([]),
  })
  .meta({ id: 'CreateUserInput' })

export const updateUserSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    roles: z.array(roleSchema).min(1, 'Elegí al menos un rol').max(ROLES.length).optional(),
    branchIds: z.array(z.uuid()).max(50).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar' })
  .meta({ id: 'UpdateUserInput' })

export const resetPasswordSchema = z
  .object({ password: z.string().max(256) })
  .meta({ id: 'ResetPasswordInput' })

const professionalSummarySchema = z
  .object({
    licenseNumber: z.string(),
    active: z.boolean(),
  })
  .meta({ id: 'ProfessionalSummary' })

export const userSchema = z
  .object({
    id: z.uuid(),
    username: z.string(),
    displayName: z.string(),
    active: z.boolean(),
    mustChangePassword: z.boolean(),
    roles: z.array(roleSchema),
    branchIds: z.array(z.uuid()),
    professional: professionalSummarySchema.nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'User' })

export type UserDto = z.infer<typeof userSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
