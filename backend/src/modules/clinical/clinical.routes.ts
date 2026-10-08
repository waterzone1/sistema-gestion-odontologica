import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import {
  clinicalEntryParamsSchema,
  clinicalPatientParamsSchema,
  correctClinicalEntrySchema,
  createClinicalEntrySchema,
} from './clinical.schemas.js'
import * as clinical from './clinical.service.js'

export function clinicalRouter(db: Db): Router {
  const router = Router({ mergeParams: true })
  const read = requirePermission('clinical:read')
  const write = requirePermission('clinical:write')

  router.get('/', read, async (req: Request, res: Response) => {
    const { patientId } = clinicalPatientParamsSchema.parse(req.params)
    res.json(await clinical.listEntries(db, authOf(req), patientId))
  })

  router.post('/', write, async (req: Request, res: Response) => {
    const { patientId } = clinicalPatientParamsSchema.parse(req.params)
    const input = createClinicalEntrySchema.parse(req.body)
    res.status(201).json(await clinical.createEntry(db, authOf(req), patientId, input))
  })

  router.post('/:entryId/corrections', write, async (req: Request, res: Response) => {
    const { patientId, entryId } = clinicalEntryParamsSchema.parse(req.params)
    const input = correctClinicalEntrySchema.parse(req.body)
    res.status(201).json(await clinical.correctEntry(db, authOf(req), patientId, entryId, input))
  })

  return router
}
