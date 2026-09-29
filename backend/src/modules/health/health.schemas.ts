import { z } from 'zod'

export const healthResponseSchema = z
  .object({
    status: z.enum(['ok', 'degraded']).meta({ description: 'degraded si alguna dependencia no responde' }),
    db: z.enum(['up', 'down']),
    uptimeSeconds: z.number().int().nonnegative(),
  })
  .meta({ id: 'HealthResponse' })

export type HealthResponse = z.infer<typeof healthResponseSchema>
