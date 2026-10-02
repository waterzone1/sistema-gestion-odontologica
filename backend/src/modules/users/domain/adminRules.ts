import type { Role } from './permissions.js'

export function isLastActiveAdmin(activeAdminIds: readonly string[], userId: string): boolean {
  return activeAdminIds.length === 1 && activeAdminIds[0] === userId
}

export function requiresBranch(roles: readonly Role[]): boolean {
  return roles.some((role) => role !== 'ADMIN')
}
