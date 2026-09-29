import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { AppError, toErrorBody } from '../shared/errors.js'

interface HttpLikeError {
  type?: string
  status?: number
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json(toErrorBody(err.code, err.message, err.details))
    return
  }

  if (err instanceof ZodError) {
    const campos = err.issues.map((issue) => ({ campo: issue.path.join('.'), motivo: issue.message }))
    res.status(400).json(toErrorBody('VALIDATION_ERROR', 'Los datos enviados no son validos', { campos }))
    return
  }

  const http = err as HttpLikeError
  if (http.type === 'entity.parse.failed') {
    res.status(400).json(toErrorBody('INVALID_JSON', 'El cuerpo de la solicitud no es un JSON valido'))
    return
  }
  if (http.type === 'entity.too.large') {
    res.status(413).json(toErrorBody('PAYLOAD_TOO_LARGE', 'El cuerpo de la solicitud es demasiado grande'))
    return
  }

  req.log.error({ err }, 'error no controlado')
  res.status(500).json(toErrorBody('INTERNAL_ERROR', 'Ocurrio un error inesperado'))
}
