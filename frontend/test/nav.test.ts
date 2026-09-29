import { describe, expect, it } from 'vitest'
import type { Permission } from '@/lib/api'
import { visibleNav } from '@/lib/nav'
import { can } from '@/lib/permissions'

const enlaces = (permissions: Permission[]) =>
  visibleNav({ permissions }).flatMap((group) => group.items.map((item) => item.href))

describe('navegacion segun permisos', () => {
  it('el administrador ve usuarios y sedes', () => {
    expect(enlaces(['users:manage', 'branches:manage', 'professionals:read'])).toEqual([
      '/dashboard',
      '/admin/users',
      '/admin/branches',
    ])
  })

  it('un rol sin permisos de administracion solo ve el inicio y no aparece el grupo vacio', () => {
    const grupos = visibleNav({ permissions: ['professionals:read'] })
    expect(grupos).toHaveLength(1)
    expect(enlaces(['professionals:read'])).toEqual(['/dashboard'])
  })

  it('no muestra opciones sueltas: cada item exige su propio permiso', () => {
    expect(enlaces(['users:manage'])).toEqual(['/dashboard', '/admin/users'])
  })
})

describe('can', () => {
  it('consulta la lista de permisos de la sesion', () => {
    expect(can({ permissions: ['users:manage'] }, 'users:manage')).toBe(true)
    expect(can({ permissions: [] }, 'users:manage')).toBe(false)
    expect(can(null, 'users:manage')).toBe(false)
  })
})
