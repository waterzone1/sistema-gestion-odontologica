import { createReadStream } from 'node:fs'
import { Router, type Request, type Response } from 'express'
import { authOf, requirePermission } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import type { Logger } from '../../shared/logger.js'
import type { BackupConfig } from './backups.archive.js'
import { backupParamsSchema, restoreSchema } from './backups.schemas.js'
import * as backups from './backups.service.js'

export function backupsRouter(db: Db, config: BackupConfig, logger: Logger): Router {
  const router = Router()
  const manage = requirePermission('backups:manage')
  const actorOf = (req: Request) => {
    const auth = authOf(req)
    return { userId: auth.userId, displayName: auth.displayName, sessionId: auth.sessionId }
  }

  router.get('/', manage, async (_req: Request, res: Response) => {
    res.json(await backups.listBackups(config))
  })

  router.get('/status', manage, async (_req: Request, res: Response) => {
    res.json(await backups.backupStatus(config))
  })

  router.post('/', manage, async (req: Request, res: Response) => {
    const { record, done } = await backups.startBackup(db, config, logger, actorOf(req), 'MANUAL')
    void done
    res.status(202).json(record)
  })

  router.get('/:id/download', manage, async (req: Request, res: Response) => {
    const { id } = backupParamsSchema.parse(req.params)
    const file = await backups.backupArchive(config, id)
    res.setHeader('Content-Type', 'application/x-tar')
    res.setHeader('Content-Disposition', `attachment; filename="${id}.tar"`)
    res.setHeader('Cache-Control', 'no-store')
    createReadStream(file)
      .on('error', (err) => {
        logger.error({ err, backup: id }, 'no se pudo leer el backup')
        res.destroy(err)
      })
      .pipe(res)
  })

  router.post('/:id/restore', manage, async (req: Request, res: Response) => {
    const { id } = backupParamsSchema.parse(req.params)
    restoreSchema.parse(req.body)
    res.json(await backups.restoreBackup(db, config, logger, actorOf(req), id))
  })

  return router
}
