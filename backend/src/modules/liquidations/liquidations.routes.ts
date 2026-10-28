import { Router, type Request, type Response } from 'express'
import { authOf, requireModule, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import {
  cancelLiquidationSchema,
  createLiquidationSchema,
  liquidationItemParamsSchema,
  liquidationParamsSchema,
  payLiquidationSchema,
  resolveItemSchema,
} from './liquidations.schemas.js'
import * as liquidations from './liquidations.service.js'

export function liquidationsRouter(db: Db): Router {
  const router = Router()
  const manage = requirePermission('liquidations:manage')
  router.use(requireModule('coverages'))

  router.get('/', manage, async (req: Request, res: Response) => {
    res.json(await liquidations.listLiquidations(db, authOf(req)))
  })

  router.post('/', manage, async (req: Request, res: Response) => {
    res.status(201).json(await liquidations.createLiquidation(db, authOf(req), createLiquidationSchema.parse(req.body)))
  })

  router.get('/:id', manage, async (req: Request, res: Response) => {
    const { id } = liquidationParamsSchema.parse(req.params)
    res.json(await liquidations.getLiquidation(db, authOf(req), id))
  })

  router.get('/:id/export', manage, async (req: Request, res: Response) => {
    const { id } = liquidationParamsSchema.parse(req.params)
    const { filename, content } = await liquidations.exportLiquidation(db, authOf(req), id)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send(content)
  })

  router.post('/:id/submit', manage, async (req: Request, res: Response) => {
    const { id } = liquidationParamsSchema.parse(req.params)
    res.json(await liquidations.submitLiquidation(db, authOf(req), id))
  })

  router.post('/:id/items/:itemId/result', manage, async (req: Request, res: Response) => {
    const { id, itemId } = liquidationItemParamsSchema.parse(req.params)
    res.json(await liquidations.resolveItem(db, authOf(req), id, itemId, resolveItemSchema.parse(req.body)))
  })

  router.post('/:id/payment', manage, async (req: Request, res: Response) => {
    const { id } = liquidationParamsSchema.parse(req.params)
    res.json(await liquidations.payLiquidation(db, authOf(req), id, payLiquidationSchema.parse(req.body)))
  })

  router.post('/:id/cancel', manage, async (req: Request, res: Response) => {
    const { id } = liquidationParamsSchema.parse(req.params)
    const { reason } = cancelLiquidationSchema.parse(req.body)
    res.json(await liquidations.cancelLiquidation(db, authOf(req), id, reason))
  })

  return router
}
