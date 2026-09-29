import type { Request, Response } from 'express'
import { toErrorBody } from '../shared/errors.js'

export function notFound(_req: Request, res: Response): void {
  res.status(404).json(toErrorBody('NOT_FOUND', 'El recurso no existe'))
}
