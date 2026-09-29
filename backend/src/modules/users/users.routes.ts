import { Router } from 'express'
import { requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import { usersController } from './users.controller.js'

export function usersRouter(db: Db): Router {
  const router = Router()
  const c = usersController(db)
  const manage = requirePermission('users:manage')

  router.get('/', manage, c.list)
  router.post('/', manage, c.create)
  router.get('/:id', manage, c.get)
  router.patch('/:id', manage, c.update)
  router.post('/:id/reset-password', manage, c.resetPassword)
  router.post('/:id/deactivate', manage, c.deactivate)
  router.post('/:id/activate', manage, c.activate)
  router.post('/:id/revoke-sessions', manage, c.revokeSessions)
  return router
}
