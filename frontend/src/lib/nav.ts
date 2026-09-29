import { Building2, LayoutDashboard, Users, type LucideIcon } from 'lucide-react'
import type { Permission, SessionUser } from './api'
import { can } from './permissions'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  permission?: Permission
}

export interface NavGroup {
  label?: string
  items: NavItem[]
}

const NAV: NavGroup[] = [
  { items: [{ href: '/dashboard', label: 'Inicio', icon: LayoutDashboard }] },
  {
    label: 'Administración',
    items: [
      { href: '/admin/users', label: 'Usuarios', icon: Users, permission: 'users:manage' },
      { href: '/admin/branches', label: 'Sedes', icon: Building2, permission: 'branches:manage' },
    ],
  },
]

// no se muestran opciones deshabilitadas: lo que el usuario no puede usar directamente no aparece
export function visibleNav(user: Pick<SessionUser, 'permissions'>): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || can(user, item.permission)),
  })).filter((group) => group.items.length > 0)
}
