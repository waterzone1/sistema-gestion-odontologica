import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import { auditQuerySchema } from './audit.schemas.js'
import { listAuditLog } from './audit.query.js'

export function auditRouter(db: Db): Router {
  const router = Router()

  router.get('/', requirePermission('audit:read'), async (req: Request, res: Response) => {
    res.json(await listAuditLog(db, authOf(req), auditQuerySchema.parse(req.query)))
  })

  return router
}
