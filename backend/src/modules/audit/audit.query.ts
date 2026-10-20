import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import type { AuthContext } from '../auth/auth.types.js'
import { organizationTimeZone } from '../availability/availability.service.js'
import { addDays, fromLocal } from '../availability/domain/availability.js'
import type { AuditListDto, AuditQuery } from './audit.schemas.js'

export async function listAuditLog(db: Db, actor: AuthContext, query: AuditQuery): Promise<AuditListDto> {
  const timeZone = await organizationTimeZone(db, actor.organizationId)
  const where: Prisma.AuditLogWhereInput = {
    organizationId: actor.organizationId,
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: fromLocal(query.from, 0, timeZone) } : {}),
            ...(query.to ? { lt: fromLocal(addDays(query.to, 1), 0, timeZone) } : {}),
          },
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.auditLog.count({ where }),
  ])
  const actorIds = [...new Set(rows.map((row) => row.actorUserId).filter((id): id is string => id !== null))]
  const users = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } })
  const byId = new Map(users.map((user) => [user.id, user]))
  return {
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actor: row.actorUserId ? (byId.get(row.actorUserId) ?? null) : null,
      metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : null,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
}
