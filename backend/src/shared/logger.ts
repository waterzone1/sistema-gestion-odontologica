import { pino } from 'pino'
import type { Logger } from 'pino'

export type { Logger }

interface LoggerOptions {
  level: string
  pretty?: boolean
}

export function createLogger({ level, pretty = false }: LoggerOptions): Logger {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
      ],
      censor: '[oculto]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty' } } : {}),
  })
}
