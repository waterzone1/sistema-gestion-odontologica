export const ROLES = ['ADMIN', 'DENTIST', 'RECEPTIONIST'] as const
export type Role = (typeof ROLES)[number]

export const PERMISSIONS = [
  'users:manage',
  'branches:manage',
  'professionals:manage',
  'professionals:read',
  'patients:read',
  'patients:write',
  'practices:read',
  'practices:manage',
  'appointments:read',
  'appointments:manage',
  'appointments:attend',
] as const
export type Permission = (typeof PERMISSIONS)[number]

export type RolePermissions = Readonly<Record<Role, readonly Permission[]>>

export const ROLE_PERMISSIONS: RolePermissions = {
  ADMIN: [
    'users:manage',
    'branches:manage',
    'professionals:manage',
    'professionals:read',
    'patients:read',
    'patients:write',
    'practices:read',
    'practices:manage',
    'appointments:read',
    'appointments:manage',
    'appointments:attend',
  ],
  DENTIST: [
    'professionals:read',
    'patients:read',
    'practices:read',
    'appointments:read',
    'appointments:attend',
  ],
  RECEPTIONIST: [
    'professionals:read',
    'patients:read',
    'patients:write',
    'practices:read',
    'appointments:read',
    'appointments:manage',
    'appointments:attend',
  ],
}

export function effectivePermissions(
  roles: readonly Role[],
  map: RolePermissions = ROLE_PERMISSIONS,
): Permission[] {
  const union = new Set<Permission>()
  for (const role of roles) {
    for (const permission of map[role]) union.add(permission)
  }
  return [...union]
}

export function hasPermission(permissions: readonly Permission[], required: Permission): boolean {
  return permissions.includes(required)
}
