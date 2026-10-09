import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import {
  adjustPriceSchema,
  billingPatientParamsSchema,
  createChargeSchema,
  creditParamsSchema,
  createServiceSchema,
  paymentParamsSchema,
  serviceParamsSchema,
  voidSchema,
} from './billing.schemas.js'
import * as billing from './billing.service.js'

export function patientBillingRouter(db: Db): Router {
  const router = Router({ mergeParams: true })

  router.get('/services', requirePermission('services:read'), async (req: Request, res: Response) => {
    const { patientId } = billingPatientParamsSchema.parse(req.params)
    res.json(await billing.listServices(db, authOf(req), patientId))
  })

  router.post('/services', requirePermission('services:write'), async (req: Request, res: Response) => {
    const { patientId } = billingPatientParamsSchema.parse(req.params)
    const input = createServiceSchema.parse(req.body)
    res.status(201).json(await billing.createService(db, authOf(req), patientId, input))
  })

  router.post('/services/:serviceId/price', requirePermission('services:price'), async (req: Request, res: Response) => {
    const { patientId, serviceId } = serviceParamsSchema.parse(req.params)
    const { price } = adjustPriceSchema.parse(req.body)
    res.json(await billing.adjustServicePrice(db, authOf(req), patientId, serviceId, price))
  })

  router.post('/services/:serviceId/void', requirePermission('services:void'), async (req: Request, res: Response) => {
    const { patientId, serviceId } = serviceParamsSchema.parse(req.params)
    const { reason } = voidSchema.parse(req.body)
    res.json(await billing.voidService(db, authOf(req), patientId, serviceId, reason))
  })

  router.get('/account', requirePermission('account:read'), async (req: Request, res: Response) => {
    const { patientId } = billingPatientParamsSchema.parse(req.params)
    res.json(await billing.getAccount(db, authOf(req), patientId))
  })

  router.post('/payments', requirePermission('payments:create'), async (req: Request, res: Response) => {
    const { patientId } = billingPatientParamsSchema.parse(req.params)
    const input = createChargeSchema.parse(req.body)
    res.status(201).json(await billing.createCharge(db, authOf(req), patientId, input))
  })

  router.post('/payments/:paymentId/void', requirePermission('payments:void'), async (req: Request, res: Response) => {
    const { patientId, paymentId } = paymentParamsSchema.parse(req.params)
    const { reason } = voidSchema.parse(req.body)
    res.json(await billing.voidPayment(db, authOf(req), patientId, paymentId, reason))
  })

  router.post('/credits/:creditId/void', requirePermission('payments:void'), async (req: Request, res: Response) => {
    const { patientId, creditId } = creditParamsSchema.parse(req.params)
    const { reason } = voidSchema.parse(req.body)
    res.json(await billing.voidCreditApplication(db, authOf(req), patientId, creditId, reason))
  })

  return router
}

export function debtorsRouter(db: Db): Router {
  const router = Router()

  router.get('/', requirePermission('account:read'), async (req: Request, res: Response) => {
    res.json(await billing.listDebtors(db, authOf(req)))
  })

  return router
}
