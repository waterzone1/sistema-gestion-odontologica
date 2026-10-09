import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import {
  appointmentIdParamsSchema,
  changeStatusSchema,
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  updateAppointmentSchema,
} from './appointments.schemas.js'
import * as appointments from './appointments.service.js'

export function appointmentsRouter(db: Db): Router {
  const router = Router()
  const read = requirePermission('appointments:read')
  const manage = requirePermission('appointments:manage')
  const attend = requirePermission('appointments:attend')

  router.get('/', read, async (req: Request, res: Response) => {
    const query = listAppointmentsQuerySchema.parse(req.query)
    res.json(await appointments.listAppointments(db, authOf(req), query))
  })

  router.post('/', manage, async (req: Request, res: Response) => {
    const input = createAppointmentSchema.parse(req.body)
    res.status(201).json(await appointments.createAppointment(db, authOf(req), input))
  })

  router.get('/:id', read, async (req: Request, res: Response) => {
    const { id } = appointmentIdParamsSchema.parse(req.params)
    res.json(await appointments.getAppointment(db, authOf(req), id))
  })

  router.patch('/:id', manage, async (req: Request, res: Response) => {
    const { id } = appointmentIdParamsSchema.parse(req.params)
    const input = updateAppointmentSchema.parse(req.body)
    res.json(await appointments.updateAppointment(db, authOf(req), id, input))
  })

  router.post('/:id/status', attend, async (req: Request, res: Response) => {
    const { id } = appointmentIdParamsSchema.parse(req.params)
    const input = changeStatusSchema.parse(req.body)
    res.json(await appointments.changeAppointmentStatus(db, authOf(req), id, input))
  })

  return router
}
