import express, { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import {
  fileParamsSchema,
  filesPatientParamsSchema,
  listFilesQuerySchema,
  uploadFileQuerySchema,
} from './files.schemas.js'
import * as files from './files.service.js'
import type { FileStorageConfig } from './files.storage.js'

export function clinicalFilesRouter(db: Db, storage: FileStorageConfig): Router {
  const router = Router({ mergeParams: true })
  const read = requirePermission('clinical:read')
  const write = requirePermission('clinical:write')

  router.get('/', read, async (req: Request, res: Response) => {
    const { patientId } = filesPatientParamsSchema.parse(req.params)
    const { archived } = listFilesQuerySchema.parse(req.query)
    res.json(await files.listFiles(db, authOf(req), patientId, archived))
  })

  router.post(
    '/',
    write,
    express.raw({ type: () => true, limit: storage.maxBytes }),
    async (req: Request, res: Response) => {
      const { patientId } = filesPatientParamsSchema.parse(req.params)
      const query = uploadFileQuerySchema.parse(req.query)
      const content = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
      res.status(201).json(await files.uploadFile(db, storage, authOf(req), patientId, query, content))
    },
  )

  router.get('/:fileId/content', read, async (req: Request, res: Response) => {
    const { patientId, fileId } = fileParamsSchema.parse(req.params)
    const { file, stream } = await files.downloadFile(db, storage, authOf(req), patientId, fileId)
    res.setHeader('Content-Type', file.mimeType)
    res.setHeader('Content-Length', String(file.size))
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  })

  router.post('/:fileId/archive', write, async (req: Request, res: Response) => {
    const { patientId, fileId } = fileParamsSchema.parse(req.params)
    res.json(await files.archiveFile(db, authOf(req), patientId, fileId))
  })

  return router
}
