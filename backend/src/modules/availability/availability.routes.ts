import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import {
  agendaAvailabilityQuerySchema,
  createExceptionSchema,
  exceptionParamsSchema,
  professionalAvailabilityParamsSchema,
  replaceRulesSchema,
} from './availability.schemas.js'
import * as availability from './availability.service.js'

export function professionalAvailabilityRouter(db: Db): Router {
  const router = Router({ mergeParams: true })

  router.get('/availability', requirePermission('professionals:read'), async (req: Request, res: Response) => {
    const { professionalId } = professionalAvailabilityParamsSchema.parse(req.params)
    res.json(await availability.getProfessionalAvailability(db, authOf(req), professionalId))
  })

  router.put('/availability/rules', requirePermission('professionals:manage'), async (req: Request, res: Response) => {
    const { professionalId } = professionalAvailabilityParamsSchema.parse(req.params)
    const input = replaceRulesSchema.parse(req.body)
    res.json(await availability.replaceRules(db, authOf(req), professionalId, input))
  })

  router.post('/exceptions', requirePermission('availability:manage'), async (req: Request, res: Response) => {
    const { professionalId } = professionalAvailabilityParamsSchema.parse(req.params)
    const input = createExceptionSchema.parse(req.body)
    res.status(201).json(await availability.createException(db, authOf(req), professionalId, input))
  })

  router.post(
    '/exceptions/:exceptionId/revoke',
    requirePermission('availability:manage'),
    async (req: Request, res: Response) => {
      const { professionalId, exceptionId } = exceptionParamsSchema.parse(req.params)
      await availability.revokeException(db, authOf(req), professionalId, exceptionId)
      res.status(204).end()
    },
  )

  return router
}

export function agendaAvailabilityRouter(db: Db): Router {
  const router = Router()

  router.get('/', requirePermission('appointments:read'), async (req: Request, res: Response) => {
    const query = agendaAvailabilityQuerySchema.parse(req.query)
    res.json(await availability.agendaAvailability(db, authOf(req), query))
  })

  return router
}
