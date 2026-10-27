import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import { createNoteSchema, listNotesQuerySchema, noteParamsSchema, notesPatientParamsSchema } from './notes.schemas.js'
import * as notes from './notes.service.js'

export function patientNotesRouter(db: Db): Router {
  const router = Router({ mergeParams: true })
  const read = requirePermission('patients:read')
  const write = requirePermission('patient-notes:write')

  router.get('/', read, async (req: Request, res: Response) => {
    const { patientId } = notesPatientParamsSchema.parse(req.params)
    const { archived } = listNotesQuerySchema.parse(req.query)
    res.json(await notes.listNotes(db, authOf(req), patientId, archived))
  })

  router.post('/', write, async (req: Request, res: Response) => {
    const { patientId } = notesPatientParamsSchema.parse(req.params)
    const input = createNoteSchema.parse(req.body)
    res.status(201).json(await notes.createNote(db, authOf(req), patientId, input))
  })

  router.post('/:noteId/archive', write, async (req: Request, res: Response) => {
    const { patientId, noteId } = noteParamsSchema.parse(req.params)
    res.json(await notes.archiveNote(db, authOf(req), patientId, noteId))
  })

  return router
}
