import type { Permission, Role, SessionUser } from './api'

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  DENTIST: 'Odontólogo',
  RECEPTIONIST: 'Recepción',
}

export const ALL_ROLES: Role[] = ['ADMIN', 'DENTIST', 'RECEPTIONIST']

export function can(user: Pick<SessionUser, 'permissions'> | null | undefined, permission: Permission) {
  return user?.permissions.includes(permission) ?? false
}

export function visibleBranches<T extends { id: string; active: boolean }>(
  user: Pick<SessionUser, 'roles' | 'branchIds'>,
  branches: T[],
): T[] {
  const isAdmin = user.roles.includes('ADMIN')
  return branches.filter((branch) => branch.active && (isAdmin || user.branchIds.includes(branch.id)))
}

export function requiresBranch(roles: readonly Role[]) {
  return roles.some((role) => role !== 'ADMIN')
}
