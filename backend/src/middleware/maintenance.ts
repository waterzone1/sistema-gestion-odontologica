import type { NextFunction, Request, Response } from 'express'
import { toErrorBody } from '../shared/errors.js'

const ALLOWED = ['/api/health', '/api/backups/status']

export function maintenanceGuard(active: () => boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!active() || ALLOWED.some((prefix) => req.path.startsWith(prefix))) {
      next()
      return
    }
    res.status(503).json(toErrorBody('MAINTENANCE', 'El sistema se está restaurando desde un backup. Probá de nuevo en unos minutos'))
  }
}
