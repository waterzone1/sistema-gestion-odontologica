import {
  Building2,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Stethoscope,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Permission, SessionUser } from './api'
import { can } from './permissions'

interface NavItem {
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
  {
    items: [
      { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
      { href: '/agenda', label: 'Agenda', icon: CalendarDays, permission: 'appointments:read' },
      { href: '/patients', label: 'Pacientes', icon: UserRound, permission: 'patients:read' },
      { href: '/professionals', label: 'Profesionales', icon: Stethoscope, permission: 'availability:manage' },
    ],
  },
  {
    label: 'Administración',
    items: [
      { href: '/admin/users', label: 'Usuarios', icon: Users, permission: 'users:manage' },
      { href: '/admin/branches', label: 'Sedes', icon: Building2, permission: 'branches:manage' },
      { href: '/admin/practices', label: 'Prácticas', icon: ClipboardList, permission: 'practices:manage' },
    ],
  },
  {
    items: [{ href: '/settings', label: 'Configuración', icon: Settings }],
  },
]

export function visibleNav(user: Pick<SessionUser, 'permissions'>): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || can(user, item.permission)),
  })).filter((group) => group.items.length > 0)
}
