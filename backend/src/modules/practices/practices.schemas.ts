import { z } from 'zod'

const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9._-]{1,19}$/, 'Entre 2 y 20 caracteres: letras, números, punto, guion o guion bajo')

const nameSchema = z.string().trim().min(2, 'Ingresá el nombre de la práctica').max(120)

const durationSchema = z.number().int().min(5, 'Mínimo 5 minutos').max(480, 'Máximo 8 horas')

const priceSchema = z
  .string()
  .trim()
  .regex(/^(?!0+(\.0+)?$)\d{1,12}(\.\d{1,2})?$/, 'Ingresá un importe mayor a cero, con hasta 2 decimales')

export const practiceIdParamsSchema = z.object({ id: z.uuid() })

export const listPracticesQuerySchema = z.object({
  status: z.enum(['active', 'all']).default('all'),
})

export const createPracticeSchema = z
  .object({
    code: codeSchema,
    name: nameSchema,
    defaultDurationMinutes: durationSchema.default(30),
    basePrice: priceSchema,
  })
  .meta({ id: 'CreatePracticeInput' })

export const updatePracticeSchema = z
  .object({
    code: codeSchema,
    name: nameSchema,
    defaultDurationMinutes: durationSchema,
    basePrice: priceSchema,
    active: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios para guardar' })
  .meta({ id: 'UpdatePracticeInput' })

export const practiceSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    defaultDurationMinutes: z.number().int(),
    basePrice: z.string().meta({ example: '25000.00', description: 'Importe en pesos con dos decimales' }),
    active: z.boolean(),
  })
  .meta({ id: 'Practice' })

export type PracticeDto = z.infer<typeof practiceSchema>
export type CreatePracticeInput = z.infer<typeof createPracticeSchema>
export type UpdatePracticeInput = z.infer<typeof updatePracticeSchema>
