import { describe, expect, it } from 'vitest'
import type { Permission } from '@/lib/api'
import { homePath, moveInOrder, visibleNav } from '@/lib/nav'
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

describe('caja', () => {
  it('la ve quien ve las cuentas', () => {
    expect(enlaces(['account:read', 'patients:read'])).toEqual(['/dashboard', '/patients', '/cash', '/settings'])
    expect(enlaces(['clinical:read'])).not.toContain('/cash')
  })
})

describe('preferencias del menu', () => {
  const permisos: Permission[] = ['appointments:read', 'patients:read', 'account:read']
  const orden = (menuOrder: string[]) =>
    visibleNav({ permissions: permisos, preferences: { menuOrder, homePage: '/dashboard' } })[0]?.items.map((i) => i.href)

  it('ordena segun lo elegido y deja al final lo que no figura', () => {
    expect(orden([])).toEqual(['/dashboard', '/agenda', '/patients', '/cash'])
    expect(orden(['/cash', '/agenda'])).toEqual(['/cash', '/agenda', '/dashboard', '/patients'])
  })

  it('sube y baja un item sin salirse de la lista', () => {
    expect(moveInOrder(['/a', '/b', '/c'], '/b', -1)).toEqual(['/b', '/a', '/c'])
    expect(moveInOrder(['/a', '/b', '/c'], '/c', 1)).toEqual(['/a', '/b', '/c'])
  })

  it('la pantalla de inicio cae en el panel si el usuario ya no tiene acceso', () => {
    expect(homePath({ permissions: permisos, preferences: { menuOrder: [], homePage: '/agenda' } })).toBe('/agenda')
    expect(homePath({ permissions: ['patients:read'], preferences: { menuOrder: [], homePage: '/agenda' } })).toBe('/dashboard')
  })
})
