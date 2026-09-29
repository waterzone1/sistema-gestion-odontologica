import type { NextFunction, Request, Response } from 'express'
import { SESSION_COOKIE } from '../modules/auth/cookie.js'
import { resolveSession } from '../modules/auth/session.service.js'
import type { Db } from '../shared/db.js'

// resuelve la sesion si hay cookie valida; no rechaza nada, eso lo hace access.ts
export function sessionMiddleware(db: Db) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const cookies = req.cookies as Record<string, unknown> | undefined
    const token = cookies?.[SESSION_COOKIE]
    if (typeof token === 'string' && token.length > 0) {
      const auth = await resolveSession(db, token)
      if (auth) req.auth = auth
    }
    next()
  }
}
