import { Router, type Request, type Response } from 'express'
import { authOf, requireAuth, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import { organizationModulesSchema, updateOrganizationSchema, updateSettingsSchema } from './organization.schemas.js'
import * as organization from './organization.service.js'

const MB = 1024 * 1024

export function organizationRouter(db: Db, maxFileBytes: number): Router {
  const router = Router()
  const fileMaxMb = Math.max(1, Math.floor(maxFileBytes / MB))

  router.get('/', requireAuth(), async (req: Request, res: Response) => {
    res.json(await organization.getOrganization(db, authOf(req), fileMaxMb))
  })

  router.patch('/', requirePermission('organization:manage'), async (req: Request, res: Response) => {
    res.json(await organization.updateOrganization(db, authOf(req), updateOrganizationSchema.parse(req.body), fileMaxMb))
  })

  router.put('/settings', requireAuth(), async (req: Request, res: Response) => {
    res.json(await organization.saveSettings(db, authOf(req), updateSettingsSchema.parse(req.body), fileMaxMb))
  })

  router.put('/modules', requirePermission('organization:manage'), async (req: Request, res: Response) => {
    res.json(await organization.setModules(db, authOf(req), organizationModulesSchema.parse(req.body)))
  })

  return router
}
