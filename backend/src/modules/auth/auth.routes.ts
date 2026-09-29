import { Router } from 'express'
import { publicRoute, requireAuth } from '../../middleware/access.js'
import { loginRateLimiter, type LoginRateLimit } from '../../middleware/rateLimit.js'
import type { Db } from '../../shared/db.js'
import { authController } from './auth.controller.js'

interface Deps {
  db: Db
  cookieSecure: boolean
  loginRateLimit: LoginRateLimit
}

export function authRouter({ db, cookieSecure, loginRateLimit }: Deps): Router {
  const router = Router()
  const c = authController({ db, cookieSecure })
  const pending = requireAuth({ allowPasswordChangePending: true })

  router.post('/login', publicRoute(), loginRateLimiter(loginRateLimit), c.login)
  router.post('/logout', pending, c.logout)
  router.get('/me', pending, c.me)
  router.post('/change-password', pending, c.changePassword)
  router.post('/onboarding/complete', requireAuth(), c.completeOnboarding)
  return router
}
