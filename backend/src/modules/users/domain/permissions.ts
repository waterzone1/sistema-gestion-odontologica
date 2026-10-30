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
  'treatment:read',
  'treatment:write',
  'treatment:price',
  'treatment:cancel',
  'patient-notes:write',
  'exchange-rate:manage',
  'coverages:manage',
  'liquidations:manage',
  'audit:read',
  'backups:manage',
  'reports:read',
  'organization:manage',
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
    'exchange-rate:manage',
    'coverages:manage',
    'liquidations:manage',
    'audit:read',
    'backups:manage',
    'reports:read',
    'organization:manage',
    'availability:manage',
    'appointments:override',
    'treatment:read',
    'treatment:price',
    'treatment:cancel',
    'patient-notes:write',
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
    'treatment:read',
    'treatment:write',
    'treatment:cancel',
    'patient-notes:write',
  ],
  RECEPTIONIST: [
    'professionals:read',
    'professionals:manage',
    'patients:read',
    'patients:write',
    'practices:read',
    'practices:manage',
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
    'exchange-rate:manage',
    'coverages:manage',
    'liquidations:manage',
    'reports:read',
    'availability:manage',
    'treatment:read',
    'treatment:price',
    'treatment:cancel',
    'patient-notes:write',
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

export interface EnabledModules {
  coverages: boolean
}

const MODULE_PERMISSIONS: Record<keyof EnabledModules, readonly Permission[]> = {
  coverages: ['coverages:manage', 'liquidations:manage'],
}

export function withModules(permissions: readonly Permission[], modules: EnabledModules): Permission[] {
  const disabled = new Set(
    (Object.keys(MODULE_PERMISSIONS) as (keyof EnabledModules)[]).flatMap((name) => (modules[name] ? [] : MODULE_PERMISSIONS[name])),
  )
  return permissions.filter((permission) => !disabled.has(permission))
}

export function hasPermission(permissions: readonly Permission[], required: Permission): boolean {
  return permissions.includes(required)
}
