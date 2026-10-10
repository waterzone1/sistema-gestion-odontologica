import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import {
  addItemSchema,
  cancelItemSchema,
  createPlanSchema,
  itemParamsSchema,
  planIdParamsSchema,
  planParamsSchema,
  priceItemSchema,
} from './treatment.schemas.js'
import * as treatment from './treatment.service.js'

export function treatmentRouter(db: Db): Router {
  const router = Router({ mergeParams: true })
  const write = requirePermission('treatment:write')
  const price = requirePermission('treatment:price')

  router.get('/', requirePermission('treatment:read'), async (req: Request, res: Response) => {
    const { patientId } = planParamsSchema.parse(req.params)
    res.json(await treatment.listPlans(db, authOf(req), patientId))
  })

  router.post('/', write, async (req: Request, res: Response) => {
    const { patientId } = planParamsSchema.parse(req.params)
    res.status(201).json(await treatment.createPlan(db, authOf(req), patientId, createPlanSchema.parse(req.body)))
  })

  router.post('/:planId/items', write, async (req: Request, res: Response) => {
    const { patientId, planId } = planIdParamsSchema.parse(req.params)
    res.status(201).json(await treatment.addItem(db, authOf(req), patientId, planId, addItemSchema.parse(req.body)))
  })

  router.post('/:planId/items/:itemId/start', write, async (req: Request, res: Response) => {
    const { patientId, planId, itemId } = itemParamsSchema.parse(req.params)
    res.json(await treatment.startItem(db, authOf(req), patientId, planId, itemId))
  })

  router.put('/:planId/items/:itemId/price', price, async (req: Request, res: Response) => {
    const { patientId, planId, itemId } = itemParamsSchema.parse(req.params)
    const input = priceItemSchema.parse(req.body)
    res.json(await treatment.priceItem(db, authOf(req), patientId, planId, itemId, input.price))
  })

  router.post('/:planId/accept', price, async (req: Request, res: Response) => {
    const { patientId, planId } = planIdParamsSchema.parse(req.params)
    res.json(await treatment.acceptPlan(db, authOf(req), patientId, planId))
  })

  router.post(
    '/:planId/items/:itemId/cancel',
    requirePermission('treatment:cancel'),
    async (req: Request, res: Response) => {
      const { patientId, planId, itemId } = itemParamsSchema.parse(req.params)
      const { reason } = cancelItemSchema.parse(req.body)
      res.json(await treatment.cancelItem(db, authOf(req), patientId, planId, itemId, reason))
    },
  )

  return router
}
