import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../../shared/password.js'
import { recordAudit } from '../audit/audit.service.js'
import { assertStrongPassword } from '../users/users.service.js'
import type { AuthContext } from './auth.types.js'
import type { ChangePasswordInput, LoginInput, SessionResponse } from './auth.schemas.js'
import {
  createSession,
  resolveSession,
  revokeSession,
  revokeUserSessions,
  type CreatedSession,
} from './session.service.js'

interface RequestMeta {
  ipAddress?: string | undefined
  userAgent?: string | undefined
}

export function toSessionResponse(auth: AuthContext): SessionResponse {
  return {
    user: {
      id: auth.userId,
      username: auth.username,
      displayName: auth.displayName,
      roles: auth.roles,
      permissions: auth.permissions,
      branchIds: auth.branchIds,
      mustChangePassword: auth.mustChangePassword,
      onboardingCompleted: auth.onboardingCompleted,
    },
    csrfToken: auth.csrfToken,
  }
}

function invalidCredentials(): AppError {
  return new AppError(401, 'INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos')
}

export async function login(
  db: Db,
  input: LoginInput,
  meta: RequestMeta,
): Promise<{ session: CreatedSession; response: SessionResponse }> {
  const user = await db.user.findFirst({ where: { username: input.username } })

  // se verifica siempre una contraseña, exista o no el usuario, para no delatarlo por el tiempo
  let passwordOk = false
  if (user) passwordOk = await verifyPassword(user.passwordHash, input.password)
  else await verifyAgainstDummy(input.password)

  if (!user || !user.active || !passwordOk) {
    await recordAudit(db, {
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user?.id ?? null,
      organizationId: user?.organizationId ?? null,
      metadata: {
        username: input.username.slice(0, 64),
        motivo: !user ? 'usuario_inexistente' : !user.active ? 'usuario_inactivo' : 'clave_incorrecta',
      },
    })
    throw invalidCredentials()
  }

  const session = await createSession(db, user.id, meta)
  const auth = await resolveSession(db, session.token)
  if (!auth) throw new AppError(500, 'INTERNAL_ERROR', 'No se pudo iniciar la sesión')
  await recordAudit(db, {
    action: 'LOGIN_SUCCESS',
    entityType: 'User',
    entityId: user.id,
    organizationId: user.organizationId,
    actorUserId: user.id,
  })
  return { session, response: toSessionResponse(auth) }
}

export async function logout(db: Db, auth: AuthContext): Promise<void> {
  await revokeSession(db, auth.sessionId)
  await recordAudit(db, {
    action: 'LOGOUT',
    entityType: 'User',
    entityId: auth.userId,
    organizationId: auth.organizationId,
    actorUserId: auth.userId,
  })
}

export async function changePassword(
  db: Db,
  auth: AuthContext,
  input: ChangePasswordInput,
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: auth.userId } })
  if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError(422, 'WRONG_CURRENT_PASSWORD', 'La contraseña actual es incorrecta')
  }
  if (input.newPassword === input.currentPassword) {
    throw new AppError(422, 'SAME_PASSWORD', 'La nueva contraseña tiene que ser distinta de la actual')
  }
  assertStrongPassword(input.newPassword, user.username)
  const passwordHash = await hashPassword(input.newPassword)

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } })
    // las demas sesiones se cierran; queda solo la que hizo el cambio
    await revokeUserSessions(tx, user.id, auth.sessionId)
    await recordAudit(tx, {
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: user.id,
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
    })
  })
}

export async function completeOnboarding(db: Db, auth: AuthContext): Promise<void> {
  await db.user.update({ where: { id: auth.userId }, data: { onboardingCompleted: true } })
}
