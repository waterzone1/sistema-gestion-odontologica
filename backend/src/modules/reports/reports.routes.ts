import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import { listDebtors } from '../billing/billing.service.js'
import { reportQuerySchema } from './reports.schemas.js'
import * as reports from './reports.service.js'

const DEBTORS_REPORT_LIMIT = 1000

export function reportsRouter(db: Db): Router {
  const router = Router()
  const read = requirePermission('reports:read')

  router.get('/appointments', read, async (req: Request, res: Response) => {
    res.json(await reports.appointmentsReport(db, authOf(req), reportQuerySchema.parse(req.query)))
  })

  router.get('/collections', read, async (req: Request, res: Response) => {
    res.json(await reports.collectionsReport(db, authOf(req), reportQuerySchema.parse(req.query)))
  })

  router.get('/services', read, async (req: Request, res: Response) => {
    res.json(await reports.servicesReport(db, authOf(req), reportQuerySchema.parse(req.query)))
  })

  router.get('/debtors', read, async (req: Request, res: Response) => {
    res.json(await listDebtors(db, authOf(req), DEBTORS_REPORT_LIMIT))
  })

  return router
}
