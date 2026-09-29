import type { Role } from './permissions.js'

// true si sacarle el rol admin (o desactivarlo) a este usuario deja la instalacion sin admins activos
export function isLastActiveAdmin(activeAdminIds: readonly string[], userId: string): boolean {
  return activeAdminIds.length === 1 && activeAdminIds[0] === userId
}

// quien no es admin solo trabaja en las sedes que tiene asignadas, asi que necesita al menos una
export function requiresBranch(roles: readonly Role[]): boolean {
  return roles.some((role) => role !== 'ADMIN')
}
