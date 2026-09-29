import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { toErrorBody } from '../shared/errors.js'

export interface LoginRateLimit {
  max: number
  windowMs: number
}

export const DEFAULT_LOGIN_RATE_LIMIT: LoginRateLimit = { max: 10, windowMs: 15 * 60 * 1000 }

// cuenta solo los intentos fallidos, por ip y usuario. no bloquea la cuenta, solo frena la fuerza bruta
export function loginRateLimiter({ max, windowMs }: LoginRateLimit) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const body = req.body as { username?: unknown } | undefined
      const username = typeof body?.username === 'string' ? body.username.toLowerCase() : ''
      return `${ipKeyGenerator(req.ip ?? '')}|${username}`
    },
    handler: (_req, res) => {
      res
        .status(429)
        .json(toErrorBody('TOO_MANY_ATTEMPTS', 'Demasiados intentos. Probá de nuevo en unos minutos.'))
    },
  })
}
