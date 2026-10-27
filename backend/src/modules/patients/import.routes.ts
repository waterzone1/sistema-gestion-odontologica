import express, { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import { toCsv } from '../../shared/csv.js'
import { TEMPLATE_ROWS } from './domain/csv.js'
import { importBodySchema } from './import.schemas.js'
import { importPatients, previewImport } from './import.service.js'

export function patientImportsRouter(db: Db): Router {
  const router = Router()
  const write = requirePermission('patients:write')
  router.use(express.json({ limit: '2mb' }))

  router.get('/template', write, (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-pacientes.csv"')
    res.send(toCsv(TEMPLATE_ROWS))
  })

  router.post('/preview', write, async (req: Request, res: Response) => {
    const { csv } = importBodySchema.parse(req.body)
    res.json(await previewImport(db, authOf(req), csv))
  })

  router.post('/', write, async (req: Request, res: Response) => {
    const { csv } = importBodySchema.parse(req.body)
    res.status(201).json(await importPatients(db, authOf(req), csv))
  })

  return router
}
