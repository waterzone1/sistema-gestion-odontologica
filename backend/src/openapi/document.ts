import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import { registerHealthDocs } from '../modules/health/health.docs.js'

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry()
  registerHealthDocs(registry)

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Sistema de Gestión Odontológica - API',
      version: '0.1.0',
      description: 'API REST del backend. Los errores siguen el formato ErrorBody.',
    },
    servers: [{ url: '/' }],
  })
}
