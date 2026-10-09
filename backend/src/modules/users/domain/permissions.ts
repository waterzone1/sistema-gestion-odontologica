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
  'clinical:read',
  'clinical:write',
  'services:read',
  'services:write',
  'services:void',
  'account:read',
  'payments:create',
  'payments:void',
  'services:price',
  'billing:void-any-day',
  'availability:manage',
  'appointments:override',
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
    'services:read',
    'services:void',
    'account:read',
    'payments:create',
    'payments:void',
    'services:write',
    'services:price',
    'billing:void-any-day',
    'availability:manage',
    'appointments:override',
  ],
  DENTIST: [
    'professionals:read',
    'patients:read',
    'practices:read',
    'appointments:read',
    'appointments:attend',
    'clinical:read',
    'clinical:write',
    'services:read',
    'services:write',
  ],
  RECEPTIONIST: [
    'professionals:read',
    'patients:read',
    'patients:write',
    'practices:read',
    'appointments:read',
    'appointments:manage',
    'appointments:attend',
    'services:read',
    'services:write',
    'services:price',
    'services:void',
    'account:read',
    'payments:create',
    'payments:void',
    'availability:manage',
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
