import { describe, expect, it } from 'vitest'
import {
  effectivePermissions,
  hasPermission,
  ROLE_PERMISSIONS,
  type RolePermissions,
} from '../../src/modules/users/domain/permissions.js'

// mapa sintetico: cada rol tiene un permiso propio, para probar la union sin depender del mapa real
const mapa: RolePermissions = {
  ADMIN: ['users:manage'],
  DENTIST: ['professionals:manage'],
  RECEPTIONIST: ['branches:manage'],
}

describe('effectivePermissions', () => {
  it('un solo rol devuelve los permisos de ese rol', () => {
    expect(effectivePermissions(['ADMIN'], mapa)).toEqual(['users:manage'])
  })

  it('con varios roles devuelve la union', () => {
    const permisos = effectivePermissions(['ADMIN', 'DENTIST'], mapa)
    expect(permisos).toHaveLength(2)
    expect(permisos).toEqual(expect.arrayContaining(['users:manage', 'professionals:manage']))
  })

  it('no repite permisos que comparten varios roles', () => {
    const permisos = effectivePermissions(['ADMIN', 'DENTIST', 'RECEPTIONIST'])
    expect(new Set(permisos).size).toBe(permisos.length)
  })

  it('sin roles no hay permisos', () => {
    expect(effectivePermissions([])).toEqual([])
  })

  it('el admin del mapa real gestiona usuarios y el resto no', () => {
    expect(ROLE_PERMISSIONS.ADMIN).toContain('users:manage')
    expect(ROLE_PERMISSIONS.DENTIST).not.toContain('users:manage')
    expect(ROLE_PERMISSIONS.RECEPTIONIST).not.toContain('users:manage')
  })

  it('hasPermission consulta la lista efectiva', () => {
    expect(hasPermission(['users:manage'], 'users:manage')).toBe(true)
    expect(hasPermission(['professionals:read'], 'users:manage')).toBe(false)
  })
})
