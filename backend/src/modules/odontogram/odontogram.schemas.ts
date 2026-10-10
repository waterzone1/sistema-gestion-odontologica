import { z } from 'zod'
import { CONDITIONS, SURFACES } from './domain/fdi.js'

const surfaceSchema = z.enum(SURFACES).meta({
  id: 'ToothSurface',
  description: 'M mesial, D distal, V vestibular, L lingual o palatina, O oclusal o incisal',
})
const conditionSchema = z.enum(CONDITIONS).meta({ id: 'ToothCondition' })

export const odontogramParamsSchema = z.object({ patientId: z.uuid() })

export const recordFindingSchema = z
  .object({
    tooth: z.number().int().meta({ description: 'Pieza en numeración FDI: 11 a 48 permanentes, 51 a 85 temporales' }),
    surfaces: z.array(surfaceSchema).max(5).default([]),
    condition: conditionSchema,
    note: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .meta({ id: 'RecordToothFindingInput' })

const findingSchema = z
  .object({
    id: z.uuid(),
    tooth: z.number().int(),
    surface: surfaceSchema.nullable(),
    condition: conditionSchema,
    note: z.string().nullable(),
    professional: z.object({ id: z.uuid(), displayName: z.string() }),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'ToothFinding' })

const workSchema = z.object({
  id: z.uuid(),
  tooth: z.number().int(),
  surfaces: z.array(surfaceSchema),
  practice: z.string(),
  status: z.string(),
  date: z.iso.datetime(),
  professional: z.string(),
})

export const odontogramSchema = z
  .object({
    current: z.array(findingSchema).meta({ description: 'Condición actual de cada pieza y superficie (lo último registrado)' }),
    history: z.array(findingSchema).meta({ description: 'Todos los registros, del más reciente al más antiguo' }),
    planned: z.array(workSchema).meta({ description: 'Ítems pendientes o en curso de planes de tratamiento' }),
    performed: z.array(workSchema).meta({ description: 'Prestaciones vigentes registradas sobre una pieza' }),
  })
  .meta({ id: 'Odontogram' })

export type RecordFindingInput = z.infer<typeof recordFindingSchema>
export type ToothFindingDto = z.infer<typeof findingSchema>
export type OdontogramDto = z.infer<typeof odontogramSchema>
