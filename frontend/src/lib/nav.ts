import {
  Building2,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Stethoscope,
  UserRound,
  Users,
  Wallet,
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
      { href: '/cash', label: 'Caja', icon: Wallet, permission: 'account:read' },
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

type NavUser = Pick<SessionUser, 'permissions'> & { preferences?: Pick<SessionUser['preferences'], 'menuOrder' | 'homePage'> }

function ordered(items: NavItem[], order: readonly string[]): NavItem[] {
  const rank = (item: NavItem) => {
    const index = order.indexOf(item.href)
    return index === -1 ? order.length : index
  }
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item)
}

export function visibleNav(user: NavUser): NavGroup[] {
  const order = user.preferences?.menuOrder ?? []
  return NAV.map((group) => ({
    ...group,
    items: ordered(
      group.items.filter((item) => !item.permission || can(user, item.permission)),
      order,
    ),
  })).filter((group) => group.items.length > 0)
}

export function navLinks(user: NavUser): NavItem[] {
  return visibleNav(user).flatMap((group) => group.items)
}

export function homePath(user: NavUser): string {
  const home = user.preferences?.homePage ?? '/dashboard'
  return navLinks(user).some((item) => item.href === home) ? home : '/dashboard'
}

export function moveInOrder(hrefs: readonly string[], href: string, offset: -1 | 1): string[] {
  const next = [...hrefs]
  const from = next.indexOf(href)
  const to = from + offset
  if (from === -1 || to < 0 || to >= next.length) return next
  ;[next[from], next[to]] = [next[to] as string, next[from] as string]
  return next
}
