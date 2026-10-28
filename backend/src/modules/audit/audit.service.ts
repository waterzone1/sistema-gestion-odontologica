import type { Db } from '../../shared/db.js'

type AuditAction =
  | 'SETUP_COMPLETED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_ROLES_CHANGED'
  | 'USER_PASSWORD_RESET'
  | 'USER_DEACTIVATED'
  | 'USER_ACTIVATED'
  | 'USER_SESSIONS_REVOKED'
  | 'BRANCH_CREATED'
  | 'BRANCH_UPDATED'
  | 'PROFESSIONAL_SAVED'
  | 'PATIENT_CREATED'
  | 'PATIENT_UPDATED'
  | 'PATIENT_ARCHIVED'
  | 'APPOINTMENT_CLOSED'
  | 'EXCHANGE_RATE_SET'
  | 'COVERAGE_SAVED'
  | 'AGREEMENT_SAVED'
  | 'PATIENT_COVERAGE_SAVED'
  | 'PATIENT_COVERAGE_ARCHIVED'
  | 'LIQUIDATION_CREATED'
  | 'LIQUIDATION_SUBMITTED'
  | 'LIQUIDATION_ITEM_RESOLVED'
  | 'LIQUIDATION_PAID'
  | 'LIQUIDATION_CANCELLED'
  | 'LIQUIDATION_EXPORTED'
  | 'BACKUP_STARTED'
  | 'BACKUP_COMPLETED'
  | 'BACKUP_FAILED'
  | 'BACKUP_RESTORED'
  | 'TREATMENT_ITEM_COMPLETED'
  | 'PATIENTS_IMPORTED'
  | 'REMINDERS_GENERATED'
  | 'ORGANIZATION_MODULES_UPDATED'
  | 'PATIENT_NOTE_CREATED'
  | 'PATIENT_NOTE_ARCHIVED'
  | 'PATIENT_UNARCHIVED'
  | 'PRACTICE_CREATED'
  | 'PRACTICE_UPDATED'
  | 'APPOINTMENT_CREATED'
  | 'APPOINTMENT_UPDATED'
  | 'APPOINTMENT_STATUS_CHANGED'
  | 'CLINICAL_HISTORY_VIEWED'
  | 'CLINICAL_ENTRY_CREATED'
  | 'CLINICAL_ENTRY_CORRECTED'
  | 'CLINICAL_PROFILE_VIEWED'
  | 'CLINICAL_PROFILE_UPDATED'
  | 'CLINICAL_FILE_UPLOADED'
  | 'CLINICAL_FILE_DOWNLOADED'
  | 'CLINICAL_FILE_ARCHIVED'
  | 'ODONTOGRAM_UPDATED'
  | 'TREATMENT_PLAN_CREATED'
  | 'TREATMENT_ITEM_ADDED'
  | 'TREATMENT_ITEM_PRICED'
  | 'TREATMENT_PLAN_ACCEPTED'
  | 'TREATMENT_ITEM_CANCELLED'
  | 'SERVICE_RECORDED'
  | 'SERVICE_VOIDED'
  | 'SERVICE_PRICE_CHANGED'
  | 'CREDIT_APPLIED'
  | 'CREDIT_VOIDED'
  | 'AVAILABILITY_RULES_CHANGED'
  | 'AVAILABILITY_EXCEPTION_CREATED'
  | 'AVAILABILITY_EXCEPTION_REVOKED'
  | 'APPOINTMENT_AVAILABILITY_OVERRIDE'
  | 'APPOINTMENT_WARNINGS_ACCEPTED'
  | 'PAYMENT_RECORDED'
  | 'PAYMENT_VOIDED'

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

type AuditClient = Pick<Db, 'auditLog'>

export function recordActorAudit(
  client: AuditClient,
  actor: { organizationId: string; userId: string },
  entry: Pick<AuditEntry, 'action' | 'entityType' | 'entityId' | 'metadata'>,
): Promise<void> {
  return recordAudit(client, { ...entry, organizationId: actor.organizationId, actorUserId: actor.userId })
}

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
