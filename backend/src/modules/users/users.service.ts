import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { hashPassword } from '../../shared/password.js'
import { recordAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { checkPassword } from '../auth/domain/passwordPolicy.js'
import { revokeUserSessions } from '../auth/session.service.js'
import { isLastActiveAdmin, requiresBranch } from './domain/adminRules.js'
import type { Role } from './domain/permissions.js'
import { findActiveAdminIds, findUserById, findUsers, toUserDto } from './users.repository.js'
import type { CreateUserInput, UpdateUserInput, UserDto } from './users.schemas.js'

export function assertStrongPassword(password: string, username: string): void {
  const problemas = checkPassword(password, username)
  if (problemas.length > 0) {
    throw new AppError(422, 'WEAK_PASSWORD', 'La contraseña no cumple los requisitos', { problemas })
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}

async function assertBranchesValid(
  db: Pick<Db, 'branch'>,
  organizationId: string,
  branchIds: string[],
): Promise<void> {
  if (branchIds.length === 0) return
  const found = await db.branch.count({
    where: { id: { in: branchIds }, organizationId, active: true },
  })
  if (found !== branchIds.length) {
    throw new AppError(422, 'INVALID_BRANCH', 'Alguna de las sedes elegidas no existe o está inactiva')
  }
}

function assertBranchRule(roles: readonly Role[], branchIds: readonly string[]): void {
  if (requiresBranch(roles) && branchIds.length === 0) {
    throw new AppError(422, 'BRANCH_REQUIRED', 'Este usuario necesita al menos una sede asignada')
  }
}

async function loadOrFail(db: Pick<Db, 'user'>, organizationId: string, id: string) {
  const user = await findUserById(db, organizationId, id)
  if (!user) throw new AppError(404, 'NOT_FOUND', 'El usuario no existe')
  return user
}

export async function listUsers(db: Db, actor: AuthContext): Promise<UserDto[]> {
  const users = await findUsers(db, actor.organizationId)
  return users.map(toUserDto)
}

export async function getUser(db: Db, actor: AuthContext, id: string): Promise<UserDto> {
  return toUserDto(await loadOrFail(db, actor.organizationId, id))
}

export async function createUser(db: Db, actor: AuthContext, input: CreateUserInput): Promise<UserDto> {
  assertStrongPassword(input.password, input.username)
  const roles = [...new Set(input.roles)]
  const branchIds = [...new Set(input.branchIds)]
  assertBranchRule(roles, branchIds)
  const passwordHash = await hashPassword(input.password)

  try {
    const id = await db.$transaction(async (tx) => {
      await assertBranchesValid(tx, actor.organizationId, branchIds)
      const user = await tx.user.create({
        data: {
          organizationId: actor.organizationId,
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          mustChangePassword: true,
          roles: { create: roles.map((role) => ({ role })) },
          branches: { create: branchIds.map((branchId) => ({ branchId })) },
        },
      })
      await recordAudit(tx, {
        action: 'USER_CREATED',
        entityType: 'User',
        entityId: user.id,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        metadata: { username: user.username, roles, branchIds },
      })
      return user.id
    })
    return toUserDto(await loadOrFail(db, actor.organizationId, id))
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'USERNAME_TAKEN', 'Ya existe un usuario con ese nombre')
    }
    throw err
  }
}

export async function updateUser(
  db: Db,
  actor: AuthContext,
  id: string,
  input: UpdateUserInput,
): Promise<UserDto> {
  await db.$transaction(async (tx) => {
    const user = await loadOrFail(tx, actor.organizationId, id)
    const currentRoles = user.roles.map((r) => r.role)
    const nextRoles = input.roles ? [...new Set(input.roles)] : currentRoles
    const nextBranchIds = input.branchIds ? [...new Set(input.branchIds)] : user.branches.map((b) => b.branchId)

    const losesAdmin = currentRoles.includes('ADMIN') && !nextRoles.includes('ADMIN')
    if (losesAdmin && user.active) {
      const admins = await findActiveAdminIds(tx, actor.organizationId)
      if (isLastActiveAdmin(admins, user.id)) {
        throw new AppError(409, 'LAST_ADMIN', 'No se puede quitar el rol de administrador al último administrador activo')
      }
    }
    assertBranchRule(nextRoles, nextBranchIds)
    if (input.branchIds) await assertBranchesValid(tx, actor.organizationId, nextBranchIds)

    await tx.user.update({
      where: { id: user.id },
      data: { ...(input.displayName ? { displayName: input.displayName } : {}) },
    })
    if (input.roles) {
      await tx.userRole.deleteMany({ where: { userId: user.id } })
      await tx.userRole.createMany({ data: nextRoles.map((role) => ({ userId: user.id, role })) })
      if (!nextRoles.includes('DENTIST') && user.professionalProfile?.active) {
        await tx.professionalProfile.update({ where: { userId: user.id }, data: { active: false } })
      }
    }
    if (input.branchIds) {
      await tx.userBranch.deleteMany({ where: { userId: user.id } })
      await tx.userBranch.createMany({
        data: nextBranchIds.map((branchId) => ({ userId: user.id, branchId })),
      })
    }

    const changed = Object.keys(input)
    await recordAudit(tx, {
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: user.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { campos: changed },
    })
    if (input.roles) {
      await recordAudit(tx, {
        action: 'USER_ROLES_CHANGED',
        entityType: 'User',
        entityId: user.id,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        metadata: { antes: currentRoles, despues: nextRoles },
      })
    }
  })
  return getUser(db, actor, id)
}

export async function resetPassword(
  db: Db,
  actor: AuthContext,
  id: string,
  password: string,
): Promise<void> {
  const user = await loadOrFail(db, actor.organizationId, id)
  assertStrongPassword(password, user.username)
  const passwordHash = await hashPassword(password)
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: true } })
    await revokeUserSessions(tx, user.id)
    await recordAudit(tx, {
      action: 'USER_PASSWORD_RESET',
      entityType: 'User',
      entityId: user.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
    })
  })
}

export async function deactivateUser(db: Db, actor: AuthContext, id: string): Promise<UserDto> {
  await db.$transaction(async (tx) => {
    const user = await loadOrFail(tx, actor.organizationId, id)
    if (user.id === actor.userId) {
      throw new AppError(409, 'CANNOT_DEACTIVATE_SELF', 'No podés desactivar tu propio usuario')
    }
    if (!user.active) return
    const admins = await findActiveAdminIds(tx, actor.organizationId)
    if (isLastActiveAdmin(admins, user.id)) {
      throw new AppError(409, 'LAST_ADMIN', 'No se puede desactivar al último administrador activo')
    }
    await tx.user.update({ where: { id: user.id }, data: { active: false } })
    const revoked = await revokeUserSessions(tx, user.id)
    await recordAudit(tx, {
      action: 'USER_DEACTIVATED',
      entityType: 'User',
      entityId: user.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { sesionesRevocadas: revoked },
    })
  })
  return getUser(db, actor, id)
}

export async function activateUser(db: Db, actor: AuthContext, id: string): Promise<UserDto> {
  await db.$transaction(async (tx) => {
    const user = await loadOrFail(tx, actor.organizationId, id)
    if (user.active) return
    await tx.user.update({ where: { id: user.id }, data: { active: true } })
    await recordAudit(tx, {
      action: 'USER_ACTIVATED',
      entityType: 'User',
      entityId: user.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
    })
  })
  return getUser(db, actor, id)
}

export async function revokeSessionsOf(db: Db, actor: AuthContext, id: string): Promise<number> {
  const user = await loadOrFail(db, actor.organizationId, id)
  return db.$transaction(async (tx) => {
    const revoked = await revokeUserSessions(tx, user.id)
    await recordAudit(tx, {
      action: 'USER_SESSIONS_REVOKED',
      entityType: 'User',
      entityId: user.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { sesionesRevocadas: revoked },
    })
    return revoked
  })
}
