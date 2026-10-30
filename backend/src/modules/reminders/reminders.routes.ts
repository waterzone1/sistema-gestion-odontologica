import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import { generateRemindersSchema, reminderParamsSchema, remindersQuerySchema } from './reminders.schemas.js'
import * as reminders from './reminders.service.js'

export function remindersRouter(db: Db): Router {
  const router = Router()
  const manage = requirePermission('appointments:manage')

  router.get('/', manage, async (req: Request, res: Response) => {
    const { date } = remindersQuerySchema.parse(req.query)
    res.json(await reminders.listReminders(db, authOf(req), date))
  })

  router.post('/generate', manage, async (req: Request, res: Response) => {
    const { date } = generateRemindersSchema.parse(req.body ?? {})
    res.json(await reminders.generateReminders(db, authOf(req), date))
  })

  router.post('/:id/sent', manage, async (req: Request, res: Response) => {
    const { id } = reminderParamsSchema.parse(req.params)
    res.json(await reminders.markSent(db, authOf(req), id))
  })

  router.post('/:id/confirm', manage, async (req: Request, res: Response) => {
    const { id } = reminderParamsSchema.parse(req.params)
    res.json(await reminders.markConfirmed(db, authOf(req), id))
  })

  router.post('/:id/cancel', manage, async (req: Request, res: Response) => {
    const { id } = reminderParamsSchema.parse(req.params)
    res.json(await reminders.cancelReminder(db, authOf(req), id))
  })

  return router
}
