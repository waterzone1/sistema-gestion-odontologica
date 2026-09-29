import { Router, type Request, type Response } from 'express'
import { publicRoute } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import { setSessionCookie } from '../auth/cookie.js'
import { setupSchema } from './setup.schemas.js'
import { needsSetup, runSetup } from './setup.service.js'
import type { SetupTokenStore } from './setupToken.js'

interface Deps {
  db: Db
  tokens: SetupTokenStore
  cookieSecure: boolean
}

export function setupRouter({ db, tokens, cookieSecure }: Deps): Router {
  const router = Router()

  router.get('/status', publicRoute(), async (_req: Request, res: Response) => {
    res.json({ needsSetup: await needsSetup(db) })
  })

  router.post('/', publicRoute(), async (req: Request, res: Response) => {
    const input = setupSchema.parse(req.body)
    const { session, response } = await runSetup(db, tokens, input, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })
    setSessionCookie(res, session.token, session.expiresAt, cookieSecure)
    res.status(201).json(response)
  })

  return router
}
