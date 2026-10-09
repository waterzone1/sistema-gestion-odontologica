import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import {
  archivePatientSchema,
  createPatientSchema,
  listPatientsQuerySchema,
  patientIdParamsSchema,
  updatePatientSchema,
} from './patients.schemas.js'
import * as patients from './patients.service.js'

export function patientsRouter(db: Db): Router {
  const router = Router()
  const read = requirePermission('patients:read')
  const write = requirePermission('patients:write')

  router.get('/', read, async (req: Request, res: Response) => {
    const query = listPatientsQuerySchema.parse(req.query)
    res.json(await patients.listPatients(db, authOf(req), query))
  })

  router.post('/', write, async (req: Request, res: Response) => {
    const input = createPatientSchema.parse(req.body)
    res.status(201).json(await patients.createPatient(db, authOf(req), input))
  })

  router.get('/:id', read, async (req: Request, res: Response) => {
    const { id } = patientIdParamsSchema.parse(req.params)
    res.json(await patients.getPatient(db, authOf(req), id))
  })

  router.patch('/:id', write, async (req: Request, res: Response) => {
    const { id } = patientIdParamsSchema.parse(req.params)
    const input = updatePatientSchema.parse(req.body)
    res.json(await patients.updatePatient(db, authOf(req), id, input))
  })

  router.post('/:id/archive', write, async (req: Request, res: Response) => {
    const { id } = patientIdParamsSchema.parse(req.params)
    const { cancelActiveAppointments } = archivePatientSchema.parse(req.body ?? {})
    res.json(await patients.setPatientArchived(db, authOf(req), id, true, cancelActiveAppointments))
  })

  router.post('/:id/unarchive', write, async (req: Request, res: Response) => {
    const { id } = patientIdParamsSchema.parse(req.params)
    res.json(await patients.setPatientArchived(db, authOf(req), id, false))
  })

  return router
}
