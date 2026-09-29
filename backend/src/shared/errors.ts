import { z } from 'zod'

export const errorBodySchema = z
  .object({
    error: z.object({
      code: z.string().meta({ example: 'APPOINTMENT_CONFLICT' }),
      message: z.string().meta({ example: 'El profesional ya tiene un turno en ese horario' }),
      details: z.unknown(),
    }),
  })
  .meta({ id: 'ErrorBody' })

export type ErrorBody = z.infer<typeof errorBodySchema>

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = {},
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function toErrorBody(code: string, message: string, details: unknown = {}): ErrorBody {
  return { error: { code, message, details } }
}
