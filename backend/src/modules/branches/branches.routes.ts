import { Router, type Request, type Response } from 'express'
import { authOf, requireAuth, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import {
  branchIdParamsSchema,
  createBranchSchema,
  updateBranchSchema,
} from './branches.schemas.js'
import * as branchesService from './branches.service.js'

export function branchesRouter(db: Db): Router {
  const router = Router()
  const manage = requirePermission('branches:manage')

  router.get('/', requireAuth(), async (req: Request, res: Response) => {
    res.json(await branchesService.listBranches(db, authOf(req)))
  })

  router.post('/', manage, async (req: Request, res: Response) => {
    const input = createBranchSchema.parse(req.body)
    res.status(201).json(await branchesService.createBranch(db, authOf(req), input))
  })

  router.patch('/:id', manage, async (req: Request, res: Response) => {
    const { id } = branchIdParamsSchema.parse(req.params)
    const input = updateBranchSchema.parse(req.body)
    res.json(await branchesService.updateBranch(db, authOf(req), id, input))
  })

  return router
}
