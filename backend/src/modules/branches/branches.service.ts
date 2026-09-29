import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { recordAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import type { BranchDto, CreateBranchInput, UpdateBranchInput } from './branches.schemas.js'

function toDto(branch: {
  id: string
  name: string
  address: string | null
  phone: string | null
  active: boolean
}): BranchDto {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    phone: branch.phone,
    active: branch.active,
  }
}

export async function listBranches(db: Db, actor: AuthContext): Promise<BranchDto[]> {
  const branches = await db.branch.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  })
  return branches.map(toDto)
}

export async function createBranch(
  db: Db,
  actor: AuthContext,
  input: CreateBranchInput,
): Promise<BranchDto> {
  return db.$transaction(async (tx) => {
    const branch = await tx.branch.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name,
        address: input.address ?? null,
        phone: input.phone ?? null,
      },
    })
    await recordAudit(tx, {
      action: 'BRANCH_CREATED',
      entityType: 'Branch',
      entityId: branch.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      branchId: branch.id,
      metadata: { name: branch.name },
    })
    return toDto(branch)
  })
}

export async function updateBranch(
  db: Db,
  actor: AuthContext,
  id: string,
  input: UpdateBranchInput,
): Promise<BranchDto> {
  return db.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({ where: { id, organizationId: actor.organizationId } })
    if (!branch) throw new AppError(404, 'NOT_FOUND', 'La sede no existe')

    if (input.active === false && branch.active) {
      const otherActive = await tx.branch.count({
        where: { organizationId: actor.organizationId, active: true, id: { not: id } },
      })
      if (otherActive === 0) {
        throw new AppError(409, 'LAST_BRANCH', 'No se puede desactivar la única sede activa')
      }
    }

    const updated = await tx.branch.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    })
    await recordAudit(tx, {
      action: 'BRANCH_UPDATED',
      entityType: 'Branch',
      entityId: id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      branchId: id,
      metadata: { campos: Object.keys(input) },
    })
    return toDto(updated)
  })
}
