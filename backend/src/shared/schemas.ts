import { z } from 'zod'

export const optionalText = (max: number, valid?: (value: string) => boolean, message = 'Valor inválido') =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => value === '' || !valid || valid(value), { message })
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()

export const phoneSchema = optionalText(40, (value) => /^[\d\s+()-]{6,40}$/.test(value), 'Teléfono inválido')
export const emailSchema = optionalText(120, (value) => z.email().safeParse(value).success, 'Email inválido')
