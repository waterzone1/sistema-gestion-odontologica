import { pino } from 'pino'
import type { Logger } from 'pino'

export type { Logger }

interface LoggerOptions {
  level: string
  pretty?: boolean
  destination?: NodeJS.WritableStream
}

export function createLogger({ level, pretty = false, destination }: LoggerOptions): Logger {
  const options = {
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
  }
  return destination ? pino(options, destination) : pino(options)
}
