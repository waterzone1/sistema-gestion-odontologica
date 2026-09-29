import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import {
  errorResponse,
  forbidden,
  invalidInput,
  json,
  noContent,
  notFound,
  readSecurity,
  unauthenticated,
  writeSecurity,
} from '../../openapi/common.js'
import {
  createUserSchema,
  idParamsSchema,
  resetPasswordSchema,
  updateUserSchema,
  userSchema,
} from './users.schemas.js'

export function registerUsersDocs(registry: OpenAPIRegistry): void {
  const tags = ['Usuarios']
  const params = { params: idParamsSchema }
  const common = { 401: unauthenticated, 403: forbidden }
  const bodyOf = (schema: z.ZodType) => ({ body: { content: { 'application/json': { schema } } } })

  registry.registerPath({
    method: 'get',
    path: '/api/users',
    tags,
    summary: 'Lista los usuarios de la organización',
    description: 'Requiere el permiso users:manage (rol Administrador).',
    security: readSecurity,
    responses: { 200: json(z.array(userSchema), 'Usuarios'), ...common },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/users',
    tags,
    summary: 'Crea un usuario con una contraseña temporal',
    description:
      'El usuario debe cambiar la contraseña en su primer ingreso. Odontólogos y recepción necesitan al menos una sede.',
    security: writeSecurity,
    request: bodyOf(createUserSchema),
    responses: {
      201: json(userSchema, 'Usuario creado'),
      400: invalidInput,
      409: errorResponse('El nombre de usuario ya existe'),
      422: errorResponse('Contraseña débil, sede requerida o sede inválida'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/users/{id}',
    tags,
    summary: 'Detalle de un usuario',
    security: readSecurity,
    request: params,
    responses: { 200: json(userSchema, 'Usuario'), 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/users/{id}',
    tags,
    summary: 'Edita nombre, roles o sedes',
    description: 'Los cambios de rol rigen de inmediato sobre las sesiones abiertas. No se puede quitar el rol al último administrador activo.',
    security: writeSecurity,
    request: { ...params, ...bodyOf(updateUserSchema) },
    responses: {
      200: json(userSchema, 'Usuario actualizado'),
      400: invalidInput,
      404: notFound,
      409: errorResponse('Dejaría al sistema sin administradores'),
      422: errorResponse('Sede requerida o inválida'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/users/{id}/reset-password',
    tags,
    summary: 'Fija una contraseña temporal y revoca las sesiones del usuario',
    security: writeSecurity,
    request: { ...params, ...bodyOf(resetPasswordSchema) },
    responses: {
      204: noContent('Contraseña restablecida'),
      404: notFound,
      422: errorResponse('Contraseña débil'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/users/{id}/deactivate',
    tags,
    summary: 'Da de baja al usuario y revoca todas sus sesiones',
    description: 'No hay borrado de usuarios: se desactivan. No se puede desactivar el propio usuario ni al último administrador.',
    security: writeSecurity,
    request: params,
    responses: {
      200: json(userSchema, 'Usuario desactivado'),
      404: notFound,
      409: errorResponse('Es el propio usuario o el último administrador activo'),
      ...common,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/users/{id}/activate',
    tags,
    summary: 'Reactiva un usuario dado de baja',
    security: writeSecurity,
    request: params,
    responses: { 200: json(userSchema, 'Usuario activo'), 404: notFound, ...common },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/users/{id}/revoke-sessions',
    tags,
    summary: 'Cierra todas las sesiones abiertas del usuario',
    security: writeSecurity,
    request: params,
    responses: {
      200: json(z.object({ revokedSessions: z.number().int() }), 'Cantidad de sesiones cerradas'),
      404: notFound,
      ...common,
    },
  })
}
