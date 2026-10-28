import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import { organizationModulesSchema } from './organization.schemas.js'
import * as organization from './organization.service.js'

export function organizationRouter(db: Db): Router {
  const router = Router()

  router.put('/modules', requirePermission('organization:manage'), async (req: Request, res: Response) => {
    res.json(await organization.setModules(db, authOf(req), organizationModulesSchema.parse(req.body)))
  })

  return router
}
