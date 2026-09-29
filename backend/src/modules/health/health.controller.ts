import type { Request, Response } from 'express'
import type { Db } from '../../shared/db.js'
import { checkHealth } from './health.service.js'

export function getHealth(db: Db) {
  return async (_req: Request, res: Response): Promise<void> => {
    const health = await checkHealth(db)
    res.status(health.status === 'ok' ? 200 : 503).json(health)
  }
}
