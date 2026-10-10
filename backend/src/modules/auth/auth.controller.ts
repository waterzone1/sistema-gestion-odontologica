import type { Request, Response } from 'express'
import { authOf } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import { changePasswordSchema, loginSchema, preferencesSchema } from './auth.schemas.js'
import * as authService from './auth.service.js'
import { clearSessionCookie, setSessionCookie } from './cookie.js'

interface Deps {
  db: Db
  cookieSecure: boolean
}

export function authController({ db, cookieSecure }: Deps) {
  return {
    login: async (req: Request, res: Response): Promise<void> => {
      const input = loginSchema.parse(req.body)
      const { session, response } = await authService.login(db, input, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      })
      setSessionCookie(res, session.token, session.expiresAt, cookieSecure)
      res.json(response)
    },

    logout: async (req: Request, res: Response): Promise<void> => {
      await authService.logout(db, authOf(req))
      clearSessionCookie(res, cookieSecure)
      res.status(204).end()
    },

    me: (req: Request, res: Response): void => {
      res.json(authService.toSessionResponse(authOf(req)))
    },

    changePassword: async (req: Request, res: Response): Promise<void> => {
      const auth = authOf(req)
      await authService.changePassword(db, auth, changePasswordSchema.parse(req.body))
      res.status(204).end()
    },

    savePreferences: async (req: Request, res: Response): Promise<void> => {
      await authService.savePreferences(db, authOf(req), preferencesSchema.parse(req.body))
      res.status(204).end()
    },

    completeOnboarding: async (req: Request, res: Response): Promise<void> => {
      await authService.completeOnboarding(db, authOf(req))
      res.status(204).end()
    },
  }
}
