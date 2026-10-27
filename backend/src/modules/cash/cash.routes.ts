import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import { cashQuerySchema, setExchangeRateSchema } from './cash.schemas.js'
import * as cash from './cash.service.js'

export function exchangeRatesRouter(db: Db): Router {
  const router = Router()

  router.get('/', requirePermission('account:read'), async (req: Request, res: Response) => {
    res.json(await cash.getExchangeRates(db, authOf(req)))
  })

  router.post('/', requirePermission('exchange-rate:manage'), async (req: Request, res: Response) => {
    const { rate } = setExchangeRateSchema.parse(req.body)
    res.status(201).json(await cash.setExchangeRate(db, authOf(req), rate))
  })

  return router
}

export function cashRouter(db: Db): Router {
  const router = Router()

  router.get('/', requirePermission('account:read'), async (req: Request, res: Response) => {
    const { date } = cashQuerySchema.parse(req.query)
    res.json(await cash.getCashDay(db, authOf(req), date))
  })

  return router
}
