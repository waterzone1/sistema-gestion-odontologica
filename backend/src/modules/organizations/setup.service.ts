import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { hashPassword } from '../../shared/password.js'
import { recordAudit } from '../audit/audit.service.js'
import type { SessionResponse } from '../auth/auth.schemas.js'
import { toSessionResponse } from '../auth/auth.service.js'
import { createSession, resolveSession, type CreatedSession } from '../auth/session.service.js'
import { assertStrongPassword, isUniqueViolation } from '../users/users.service.js'
import type { SetupInput } from './setup.schemas.js'
import type { SetupTokenStore } from './setupToken.js'

export async function needsSetup(db: Pick<Db, 'organization'>): Promise<boolean> {
  return (await db.organization.count()) === 0
}

interface RequestMeta {
  ipAddress?: string | undefined
  userAgent?: string | undefined
}

export async function runSetup(
  db: Db,
  tokens: SetupTokenStore,
  input: SetupInput,
  meta: RequestMeta,
): Promise<{ session: CreatedSession; response: SessionResponse }> {
  if (!(await needsSetup(db))) {
    throw new AppError(409, 'ALREADY_SETUP', 'La instalación ya fue configurada')
  }
  if (!tokens.matches(input.setupToken)) {
    throw new AppError(403, 'INVALID_SETUP_TOKEN', 'El código de instalación no es válido')
  }
  assertStrongPassword(input.admin.password, input.admin.username)
  const passwordHash = await hashPassword(input.admin.password)

  try {
    const userId = await db.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: input.organization.name, timezone: input.organization.timezone },
      })
      const branch = await tx.branch.create({
        data: {
          organizationId: organization.id,
          name: input.branch.name,
          address: input.branch.address ?? null,
          phone: input.branch.phone ?? null,
        },
      })
      const admin = await tx.user.create({
        data: {
          organizationId: organization.id,
          username: input.admin.username,
          displayName: input.admin.displayName,
          passwordHash,
          roles: { create: [{ role: 'ADMIN' }] },
          branches: { create: [{ branchId: branch.id }] },
        },
      })
      await recordAudit(tx, {
        action: 'SETUP_COMPLETED',
        entityType: 'Organization',
        entityId: organization.id,
        organizationId: organization.id,
        actorUserId: admin.id,
        branchId: branch.id,
      })
      return admin.id
    })
    tokens.consume()

    const session = await createSession(db, userId, meta)
    const auth = await resolveSession(db, session.token)
    if (!auth) throw new AppError(500, 'INTERNAL_ERROR', 'No se pudo iniciar la sesión')
    return { session, response: toSessionResponse(auth) }
  } catch (err) {
    // el indice unico de organizacion frena dos setups simultaneos
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'ALREADY_SETUP', 'La instalación ya fue configurada')
    }
    throw err
  }
}
