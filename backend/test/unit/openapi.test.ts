import { describe, expect, it } from 'vitest'
import { buildOpenApiDocument } from '../../src/openapi/document.js'

describe('documento openapi', () => {
  const doc = buildOpenApiDocument()

  it('documenta /api/health con sus respuestas', () => {
    const health = doc.paths?.['/api/health']?.get
    expect(health).toBeDefined()
    expect(Object.keys(health?.responses ?? {})).toEqual(['200', '500', '503'])
  })

  it('incluye los esquemas compartidos', () => {
    expect(doc.components?.schemas).toHaveProperty('HealthResponse')
    expect(doc.components?.schemas).toHaveProperty('ErrorBody')
  })
})
