import type { Permission, Role, SessionUser } from './api'

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  DENTIST: 'Odontólogo',
  RECEPTIONIST: 'Recepción',
}

export const ALL_ROLES: Role[] = ['ADMIN', 'DENTIST', 'RECEPTIONIST']

// solo para mostrar u ocultar opciones; la autorizacion real la hace el backend
export function can(user: Pick<SessionUser, 'permissions'> | null | undefined, permission: Permission) {
  return user?.permissions.includes(permission) ?? false
}

export function requiresBranch(roles: readonly Role[]) {
  return roles.some((role) => role !== 'ADMIN')
}
