import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import { registerAuthDocs } from '../modules/auth/auth.docs.js'
import { registerBranchesDocs } from '../modules/branches/branches.docs.js'
import { registerHealthDocs } from '../modules/health/health.docs.js'
import { registerProfessionalsDocs } from '../modules/professionals/professionals.docs.js'
import { registerUsersDocs } from '../modules/users/users.docs.js'

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry()
  registerHealthDocs(registry)
  registerAuthDocs(registry)
  registerUsersDocs(registry)
  registerBranchesDocs(registry)
  registerProfessionalsDocs(registry)

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Sistema de Gestión Odontológica - API',
      version: '0.2.0',
      description:
        'API REST del backend. Se autentica con una cookie de sesión HttpOnly. Las escrituras ' +
        'requieren el header Origin de la aplicación y el token CSRF de la sesión. ' +
        'Los errores siguen el formato ErrorBody.',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'Health' },
      { name: 'Setup' },
      { name: 'Auth' },
      { name: 'Usuarios' },
      { name: 'Sedes' },
      { name: 'Profesionales' },
    ],
  })
}
