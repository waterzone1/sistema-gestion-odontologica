import { z } from 'zod'

const nameSchema = z.string().trim().min(2, 'Ingresá el nombre de la sede').max(120)
const optionalText = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v === '' ? null : v))
  .nullable()

export const branchIdParamsSchema = z.object({ id: z.uuid() })

export const createBranchSchema = z
  .object({
    name: nameSchema,
    address: optionalText.optional(),
    phone: optionalText.optional(),
  })
  .meta({ id: 'CreateBranchInput' })

export const updateBranchSchema = z
  .object({
    name: nameSchema.optional(),
    address: optionalText.optional(),
    phone: optionalText.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar' })
  .meta({ id: 'UpdateBranchInput' })

export const branchSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    active: z.boolean(),
  })
  .meta({ id: 'Branch' })

export type BranchDto = z.infer<typeof branchSchema>
export type CreateBranchInput = z.infer<typeof createBranchSchema>
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>
