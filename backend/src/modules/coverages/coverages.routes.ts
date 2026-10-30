import { Router, type Request, type Response } from 'express'
import { authOf, requireModule, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import {
  coverageQuoteQuerySchema,
  createAgreementSchema,
  createPatientCoverageSchema,
  createPlanSchema,
  createProviderSchema,
  idParamsSchema,
  patientCoverageParamsSchema,
  patientParamsSchema,
  updateAgreementSchema,
  updatePlanSchema,
  updateProviderSchema,
} from './coverages.schemas.js'
import * as coverages from './coverages.service.js'

export function coveragesRouter(db: Db): Router {
  const router = Router()
  const manage = requirePermission('coverages:manage')
  router.use(requireModule('coverages'))

  router.get('/', requirePermission('patients:read'), async (req: Request, res: Response) => {
    res.json(await coverages.listProviders(db, authOf(req)))
  })

  router.post('/providers', manage, async (req: Request, res: Response) => {
    res.status(201).json(await coverages.createProvider(db, authOf(req), createProviderSchema.parse(req.body)))
  })

  router.patch('/providers/:id', manage, async (req: Request, res: Response) => {
    const { id } = idParamsSchema.parse(req.params)
    res.json(await coverages.updateProvider(db, authOf(req), id, updateProviderSchema.parse(req.body)))
  })

  router.post('/providers/:id/plans', manage, async (req: Request, res: Response) => {
    const { id } = idParamsSchema.parse(req.params)
    res.status(201).json(await coverages.createPlan(db, authOf(req), id, createPlanSchema.parse(req.body)))
  })

  router.patch('/plans/:id', manage, async (req: Request, res: Response) => {
    const { id } = idParamsSchema.parse(req.params)
    res.json(await coverages.updatePlan(db, authOf(req), id, updatePlanSchema.parse(req.body)))
  })

  router.get('/plans/:id/agreements', requirePermission('account:read'), async (req: Request, res: Response) => {
    const { id } = idParamsSchema.parse(req.params)
    res.json(await coverages.listAgreements(db, authOf(req), id))
  })

  router.post('/plans/:id/agreements', manage, async (req: Request, res: Response) => {
    const { id } = idParamsSchema.parse(req.params)
    res.status(201).json(await coverages.createAgreement(db, authOf(req), id, createAgreementSchema.parse(req.body)))
  })

  router.put('/agreements/:id', manage, async (req: Request, res: Response) => {
    const { id } = idParamsSchema.parse(req.params)
    res.json(await coverages.updateAgreement(db, authOf(req), id, updateAgreementSchema.parse(req.body)))
  })

  return router
}

export function patientCoveragesRouter(db: Db): Router {
  const router = Router({ mergeParams: true })
  const enabled = requireModule('coverages')

  router.get('/coverages', requirePermission('patients:read'), enabled, async (req: Request, res: Response) => {
    const { patientId } = patientParamsSchema.parse(req.params)
    res.json(await coverages.listPatientCoverages(db, authOf(req), patientId))
  })

  router.post('/coverages', requirePermission('patients:write'), enabled, async (req: Request, res: Response) => {
    const { patientId } = patientParamsSchema.parse(req.params)
    const input = createPatientCoverageSchema.parse(req.body)
    res.status(201).json(await coverages.addPatientCoverage(db, authOf(req), patientId, input))
  })

  router.post('/coverages/:coverageId/archive', requirePermission('patients:write'), enabled, async (req: Request, res: Response) => {
    const { patientId, coverageId } = patientCoverageParamsSchema.parse(req.params)
    res.json(await coverages.archivePatientCoverage(db, authOf(req), patientId, coverageId))
  })

  router.get('/coverage-quote', requirePermission('services:read'), enabled, async (req: Request, res: Response) => {
    const { patientId } = patientParamsSchema.parse(req.params)
    const { practiceId, date } = coverageQuoteQuerySchema.parse(req.query)
    res.json(await coverages.quoteCoverage(db, authOf(req), patientId, practiceId, date))
  })

  return router
}
