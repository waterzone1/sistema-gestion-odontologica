import { Router } from 'express'
import type { Db } from '../../shared/db.js'
import { getHealth } from './health.controller.js'

export function healthRouter(db: Db): Router {
  const router = Router()
  router.get('/', getHealth(db))
  return router
}
