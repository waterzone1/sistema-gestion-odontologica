import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { Permission } from '../modules/users/domain/permissions.js'
import { hasPermission } from '../modules/users/domain/permissions.js'
import { AppError } from '../shared/errors.js'

type AccessPolicy =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'permission'; permission: Permission }

export type GuardedHandler = RequestHandler & { accessPolicy: AccessPolicy }

function guard(policy: AccessPolicy, handler: RequestHandler): GuardedHandler {
  return Object.assign(handler, { accessPolicy: policy })
}

export function isGuarded(handler: unknown): handler is GuardedHandler {
  return typeof handler === 'function' && 'accessPolicy' in handler
}

export function publicRoute(): GuardedHandler {
  return guard({ kind: 'public' }, (_req, _res, next) => {
    next()
  })
}

function requireSession(req: Request, allowPasswordChangePending: boolean): void {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Necesitás iniciar sesión')
  if (req.auth.mustChangePassword && !allowPasswordChangePending) {
    throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Tenés que cambiar tu contraseña para continuar')
  }
}

export function requireAuth(options: { allowPasswordChangePending?: boolean } = {}): GuardedHandler {
  return guard({ kind: 'authenticated' }, (req: Request, _res: Response, next: NextFunction) => {
    requireSession(req, options.allowPasswordChangePending ?? false)
    next()
  })
}

export function requirePermission(permission: Permission): GuardedHandler {
  return guard(
    { kind: 'permission', permission },
    (req: Request, _res: Response, next: NextFunction) => {
      requireSession(req, false)
      if (!req.auth || !hasPermission(req.auth.permissions, permission)) {
        throw new AppError(403, 'FORBIDDEN', 'No tenés permiso para realizar esta acción')
      }
      next()
    },
  )
}

export function authOf(req: Request) {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Necesitás iniciar sesión')
  return req.auth
}
