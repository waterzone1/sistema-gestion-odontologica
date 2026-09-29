import type { Db } from '../../shared/db.js'

export const AUDIT_ACTIONS = [
  'SETUP_COMPLETED',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  'PASSWORD_CHANGED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_ROLES_CHANGED',
  'USER_PASSWORD_RESET',
  'USER_DEACTIVATED',
  'USER_ACTIVATED',
  'USER_SESSIONS_REVOKED',
  'BRANCH_CREATED',
  'BRANCH_UPDATED',
  'PROFESSIONAL_SAVED',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

type Metadata = Record<string, string | number | boolean | null | string[]>

export interface AuditEntry {
  action: AuditAction
  entityType: string
  entityId?: string | null
  organizationId?: string | null
  actorUserId?: string | null
  branchId?: string | null
  metadata?: Metadata
}

// sirve tanto con el cliente normal como dentro de una transaccion
type AuditClient = Pick<Db, 'auditLog'>

// nunca pasar contraseñas, hashes ni tokens en metadata
export async function recordAudit(client: AuditClient, entry: AuditEntry): Promise<void> {
  await client.auditLog.create({
    data: {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      organizationId: entry.organizationId ?? null,
      actorUserId: entry.actorUserId ?? null,
      branchId: entry.branchId ?? null,
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
    },
  })
}
