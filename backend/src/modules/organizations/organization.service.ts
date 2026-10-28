import type { Db } from '../../shared/db.js'
import { recordActorAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import type { OrganizationModules } from './organization.schemas.js'

export async function setModules(db: Db, actor: AuthContext, modules: OrganizationModules): Promise<OrganizationModules> {
  return db.$transaction(async (tx) => {
    const updated = await tx.organization.update({
      where: { id: actor.organizationId },
      data: { coveragesEnabled: modules.coverages },
      select: { coveragesEnabled: true },
    })
    await recordActorAudit(tx, actor, {
      action: 'ORGANIZATION_MODULES_UPDATED',
      entityType: 'Organization',
      entityId: actor.organizationId,
      metadata: { coberturas: modules.coverages },
    })
    return { coverages: updated.coveragesEnabled }
  })
}
