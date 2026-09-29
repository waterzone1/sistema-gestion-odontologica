import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // origen desde el que se sirve la app (el que ve el navegador); se usa para validar CSRF
  APP_ORIGIN: z
    .url()
    .default('http://localhost:3000')
    .transform((value) => value.replace(/\/$/, '')),
  DATABASE_URL: z
    .string({ error: 'falta DATABASE_URL' })
    .regex(/^postgres(ql)?:\/\//, 'debe empezar con postgresql://'),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const problemas = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n')
    throw new Error(`configuracion invalida:\n${problemas}`)
  }
  return result.data
}
