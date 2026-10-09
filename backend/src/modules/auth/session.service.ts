import type { Db } from '../../shared/db.js'
import { generateToken, hashToken } from '../../shared/tokens.js'
import { effectivePermissions } from '../users/domain/permissions.js'
import type { AuthContext } from './auth.types.js'
import { absoluteExpiry, sessionState, shouldTouch } from './domain/session.js'

interface NewSessionMeta {
  ipAddress?: string | undefined
  userAgent?: string | undefined
}

export interface CreatedSession {
  token: string
  csrfToken: string
  expiresAt: Date
}

export async function createSession(
  db: Pick<Db, 'session'>,
  userId: string,
  meta: NewSessionMeta = {},
  now = new Date(),
): Promise<CreatedSession> {
  const token = generateToken()
  const csrfToken = generateToken()
  const expiresAt = absoluteExpiry(now)
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      csrfToken,
      expiresAt,
      lastSeenAt: now,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  })
  return { token, csrfToken, expiresAt }
}

export async function resolveSession(
  db: Db,
  token: string,
  now = new Date(),
): Promise<AuthContext | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { roles: true, branches: true } } },
  })
  if (!session) return null
  if (sessionState(session, now) !== 'valid') return null
  if (!session.user.active) return null

  if (shouldTouch(session.lastSeenAt, now)) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: now } })
  }

  const roles = session.user.roles.map((r) => r.role)
  return {
    userId: session.user.id,
    organizationId: session.user.organizationId,
    sessionId: session.id,
    csrfToken: session.csrfToken,
    username: session.user.username,
    displayName: session.user.displayName,
    roles,
    permissions: effectivePermissions(roles),
    branchIds: session.user.branches.map((b) => b.branchId),
    mustChangePassword: session.user.mustChangePassword,
    onboardingCompleted: session.user.onboardingCompleted,
    theme: session.user.theme,
  }
}

export async function revokeSession(db: Pick<Db, 'session'>, sessionId: string): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function revokeUserSessions(
  db: Pick<Db, 'session'>,
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const result = await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  })
  return result.count
}
