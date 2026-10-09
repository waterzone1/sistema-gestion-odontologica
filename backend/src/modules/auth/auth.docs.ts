import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import {
  errorResponse,
  forbidden,
  invalidInput,
  json,
  noContent,
  readSecurity,
  unauthenticated,
  writeSecurity,
} from '../../openapi/common.js'
import { setupResponseSchema, setupSchema, setupStatusSchema } from '../organizations/setup.schemas.js'
import { changePasswordSchema, loginSchema, preferencesSchema, sessionResponseSchema } from './auth.schemas.js'

export function registerAuthDocs(registry: OpenAPIRegistry): void {
  const body = (schema: typeof loginSchema) => ({ content: { 'application/json': { schema } } })

  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'sid',
    description: 'Cookie de sesión HttpOnly que emite el login o el setup inicial',
  })
  registry.registerComponent('securitySchemes', 'csrfToken', {
    type: 'apiKey',
    in: 'header',
    name: 'X-CSRF-Token',
    description: 'Token de la sesión (viene en la respuesta de login y de /auth/me). Las escrituras también exigen el header Origin de la app.',
  })

  registry.registerPath({
    method: 'get',
    path: '/api/setup/status',
    tags: ['Setup'],
    summary: 'Indica si la instalación todavía necesita configuración inicial',
    responses: { 200: json(setupStatusSchema, 'Estado de la instalación') },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/setup',
    tags: ['Setup'],
    summary: 'Configuración inicial: organización, primera sede y primer administrador',
    description:
      'Requiere el código de instalación que el servidor muestra en su log al arrancar sin configurar. Solo funciona una vez.',
    request: { body: { content: { 'application/json': { schema: setupSchema } } } },
    responses: {
      201: json(setupResponseSchema, 'Instalación configurada; inicia sesión con el administrador'),
      400: invalidInput,
      403: errorResponse('Código de instalación inválido'),
      409: errorResponse('La instalación ya está configurada'),
      422: errorResponse('La contraseña del administrador no cumple los requisitos'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/auth/login',
    tags: ['Auth'],
    summary: 'Inicia sesión',
    description: 'Limitado a 10 intentos fallidos cada 15 minutos por usuario e IP.',
    request: { body: body(loginSchema) },
    responses: {
      200: json(sessionResponseSchema, 'Sesión iniciada; se emite la cookie sid'),
      400: invalidInput,
      401: errorResponse('Usuario o contraseña incorrectos'),
      403: forbidden,
      429: errorResponse('Demasiados intentos fallidos'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/auth/logout',
    tags: ['Auth'],
    summary: 'Cierra la sesión actual',
    security: writeSecurity,
    responses: { 204: noContent('Sesión cerrada'), 401: unauthenticated, 403: forbidden },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/auth/me',
    tags: ['Auth'],
    summary: 'Usuario de la sesión, con sus permisos efectivos y el token CSRF',
    security: readSecurity,
    responses: { 200: json(sessionResponseSchema, 'Sesión actual'), 401: unauthenticated },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/auth/change-password',
    tags: ['Auth'],
    summary: 'Cambia la contraseña propia; cierra las demás sesiones del usuario',
    security: writeSecurity,
    request: { body: { content: { 'application/json': { schema: changePasswordSchema } } } },
    responses: {
      204: noContent('Contraseña cambiada'),
      400: invalidInput,
      401: unauthenticated,
      403: forbidden,
      422: errorResponse('Contraseña actual incorrecta, igual a la actual o que no cumple los requisitos'),
    },
  })

  registry.registerPath({
    method: 'put',
    path: '/api/auth/preferences',
    tags: ['Auth'],
    summary: 'Guarda las preferencias del usuario (tema claro, oscuro o del sistema)',
    security: writeSecurity,
    request: { body: { content: { 'application/json': { schema: preferencesSchema } } } },
    responses: { 204: noContent('Guardado'), 400: invalidInput, 401: unauthenticated, 403: forbidden },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/auth/onboarding/complete',
    tags: ['Auth'],
    summary: 'Marca el tutorial inicial como completado',
    security: writeSecurity,
    responses: { 204: noContent('Registrado'), 401: unauthenticated, 403: forbidden },
  })
}
