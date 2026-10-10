import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import { odontogramParamsSchema, recordFindingSchema } from './odontogram.schemas.js'
import * as odontogram from './odontogram.service.js'

export function odontogramRouter(db: Db): Router {
  const router = Router({ mergeParams: true })

  router.get('/', requirePermission('clinical:read'), async (req: Request, res: Response) => {
    const { patientId } = odontogramParamsSchema.parse(req.params)
    res.json(await odontogram.getOdontogram(db, authOf(req), patientId))
  })

  router.post('/findings', requirePermission('clinical:write'), async (req: Request, res: Response) => {
    const { patientId } = odontogramParamsSchema.parse(req.params)
    const input = recordFindingSchema.parse(req.body)
    res.status(201).json(await odontogram.recordFinding(db, authOf(req), patientId, input))
  })

  return router
}
