import type { ZodType } from 'zod'
import { errorBodySchema } from '../shared/errors.js'

export const json = (schema: ZodType, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

export const errorResponse = (description: string) => json(errorBodySchema, description)

export const noContent = (description: string) => ({ description })

export const unauthenticated = errorResponse('Sin sesión iniciada')
export const forbidden = errorResponse('Sin permiso, o falla la verificación CSRF')
export const notFound = errorResponse('El recurso no existe (o pertenece a otra organización)')
export const invalidInput = errorResponse('Los datos enviados no son válidos')

export const readSecurity = [{ cookieAuth: [] }]
export const writeSecurity = [{ cookieAuth: [], csrfToken: [] }]
