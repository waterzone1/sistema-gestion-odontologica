import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import {
  createPracticeSchema,
  listPracticesQuerySchema,
  practiceIdParamsSchema,
  updatePracticeSchema,
} from './practices.schemas.js'
import * as practices from './practices.service.js'

export function practicesRouter(db: Db): Router {
  const router = Router()

  router.get('/', requirePermission('practices:read'), async (req: Request, res: Response) => {
    const { status } = listPracticesQuerySchema.parse(req.query)
    res.json(await practices.listPractices(db, authOf(req), status))
  })

  router.post('/', requirePermission('practices:manage'), async (req: Request, res: Response) => {
    const input = createPracticeSchema.parse(req.body)
    res.status(201).json(await practices.createPractice(db, authOf(req), input))
  })

  router.patch('/:id', requirePermission('practices:manage'), async (req: Request, res: Response) => {
    const { id } = practiceIdParamsSchema.parse(req.params)
    const input = updatePracticeSchema.parse(req.body)
    res.json(await practices.updatePractice(db, authOf(req), id, input))
  })

  return router
}
