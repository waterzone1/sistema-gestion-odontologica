import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import * as professionals from './professionals.service.js'

export function professionalsRouter(db: Db): Router {
  const router = Router()

  router.get('/', requirePermission('professionals:read'), async (req: Request, res: Response) => {
    res.json(await professionals.listProfessionals(db, authOf(req)))
  })

  router.put('/:userId', requirePermission('professionals:manage'), async (req: Request, res: Response) => {
    const { userId } = professionals.professionalParamsSchema.parse(req.params)
    const input = professionals.saveProfessionalSchema.parse(req.body)
    res.json(await professionals.saveProfessional(db, authOf(req), userId, input))
  })

  return router
}
