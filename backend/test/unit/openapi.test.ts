import { describe, expect, it } from 'vitest'
import { buildOpenApiDocument } from '../../src/openapi/document.js'

describe('documento openapi', () => {
  const doc = buildOpenApiDocument()

  it('documenta /api/health con sus respuestas', () => {
    const health = doc.paths?.['/api/health']?.get
    expect(health).toBeDefined()
    expect(Object.keys(health?.responses ?? {})).toEqual(['200', '500', '503'])
  })

  it('documenta todos los recursos de auth, usuarios, sedes y profesionales', () => {
    const rutas = Object.keys(doc.paths ?? {})
    expect(rutas).toEqual(
      expect.arrayContaining([
        '/api/setup',
        '/api/setup/status',
        '/api/auth/login',
        '/api/auth/logout',
        '/api/auth/me',
        '/api/auth/change-password',
        '/api/users',
        '/api/users/{id}',
        '/api/users/{id}/deactivate',
        '/api/branches',
        '/api/professionals',
      ]),
    )
  })

  it('declara los esquemas de seguridad de la cookie y del token CSRF', () => {
    expect(doc.components?.securitySchemes).toHaveProperty('cookieAuth')
    expect(doc.components?.securitySchemes).toHaveProperty('csrfToken')
  })

  it('incluye los esquemas compartidos', () => {
    expect(doc.components?.schemas).toHaveProperty('HealthResponse')
    expect(doc.components?.schemas).toHaveProperty('ErrorBody')
  })
})
