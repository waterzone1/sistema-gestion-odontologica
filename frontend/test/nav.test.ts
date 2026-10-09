import { describe, expect, it } from 'vitest'
import type { Permission } from '@/lib/api'
import { visibleNav } from '@/lib/nav'
import { can } from '@/lib/permissions'

const enlaces = (permissions: Permission[]) =>
  visibleNav({ permissions }).flatMap((group) => group.items.map((item) => item.href))

describe('navegacion segun permisos', () => {
  it('el administrador ve pacientes, usuarios y sedes', () => {
    expect(
      enlaces(['users:manage', 'branches:manage', 'professionals:read', 'patients:read']),
    ).toEqual(['/dashboard', '/patients', '/admin/users', '/admin/branches', '/settings'])
  })

  it('quien puede leer pacientes ve el listado aunque no administre nada', () => {
    expect(enlaces(['patients:read'])).toEqual(['/dashboard', '/patients', '/settings'])
  })

  it('un rol sin permisos de administracion no ve el grupo vacio, pero si su configuracion', () => {
    const grupos = visibleNav({ permissions: ['professionals:read'] })
    expect(grupos).toHaveLength(2)
    expect(enlaces(['professionals:read'])).toEqual(['/dashboard', '/settings'])
  })

  it('quien gestiona la disponibilidad ve profesionales', () => {
    expect(enlaces(['availability:manage', 'appointments:read'])).toEqual(['/dashboard', '/agenda', '/professionals', '/settings'])
  })

  it('no muestra opciones sueltas: cada item exige su propio permiso', () => {
    expect(enlaces(['users:manage'])).toEqual(['/dashboard', '/admin/users', '/settings'])
  })
})

describe('can', () => {
  it('consulta la lista de permisos de la sesion', () => {
    expect(can({ permissions: ['users:manage'] }, 'users:manage')).toBe(true)
    expect(can({ permissions: [] }, 'users:manage')).toBe(false)
    expect(can(null, 'users:manage')).toBe(false)
  })
})
