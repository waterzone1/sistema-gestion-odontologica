import { Router } from 'express'
import { publicRoute } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import { getHealth } from './health.controller.js'

export function healthRouter(db: Db): Router {
  const router = Router()
  router.get('/', publicRoute(), getHealth(db))
  return router
}
