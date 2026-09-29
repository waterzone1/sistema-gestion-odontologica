import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../shared/errors.js'
import { safeEqual } from '../shared/tokens.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// dos capas: el origin tiene que ser el de la app y, si hay sesion, el token de la sesion en un header
export function csrfProtection(appOrigin: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) {
      next()
      return
    }
    if (req.get('origin') !== appOrigin) {
      throw new AppError(403, 'CSRF_ORIGIN', 'Origen de la solicitud no permitido')
    }
    if (req.auth) {
      const token = req.get('x-csrf-token')
      if (!token || !safeEqual(token, req.auth.csrfToken)) {
        throw new AppError(403, 'CSRF_TOKEN', 'Token CSRF inválido o ausente')
      }
    }
    next()
  }
}
