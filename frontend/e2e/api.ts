import { request, type APIRequestContext, type APIResponse } from '@playwright/test'

const ORIGIN = 'https://localhost:8443'

export const ADMIN_USERNAME = 'marta'
export const ADMIN_PASSWORD = 'Clave-del-admin-2026'
export const RECEPCION = { username: 'recepcion1', password: 'Clave-de-rosa-2026', displayName: 'Rosa Recepción' }
export const ODONTOLOGO = { username: 'odontologo1', password: 'Clave-de-juan-2026', displayName: 'Dr. Juan Paz' }

export interface ApiSession {
  userId: string
  get: (path: string) => Promise<APIResponse>
  post: (path: string, data?: object) => Promise<APIResponse>
  put: (path: string, data: object) => Promise<APIResponse>
  patch: (path: string, data: object) => Promise<APIResponse>
  dispose: () => Promise<void>
}

function wrap(context: APIRequestContext, csrfToken: string, userId: string): ApiSession {
  const headers = { 'X-CSRF-Token': csrfToken }
  return {
    userId,
    get: (path) => context.get(path),
    post: (path, data = {}) => context.post(path, { data, headers }),
    put: (path, data) => context.put(path, { data, headers }),
    patch: (path, data) => context.patch(path, { data, headers }),
    dispose: () => context.dispose(),
  }
}

export async function apiLogin(username: string, password: string): Promise<ApiSession> {
  const context = await request.newContext({
    baseURL: ORIGIN,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Origin: ORIGIN },
  })
  const res = await context.post('/api/auth/login', { data: { username, password } })
  if (!res.ok()) throw new Error(`login por api fallo para ${username}: ${res.status()}`)
  const body = (await res.json()) as { csrfToken: string; user: { id: string } }
  return wrap(context, body.csrfToken, body.user.id)
}

interface NewUser {
  username: string
  displayName: string
  roles: string[]
  branchIds: string[]
  password: string
  licenseNumber?: string
}

export async function provisionUser(admin: ApiSession, user: NewUser): Promise<string> {
  const temporary = `${user.password}-temporal`
  const created = await admin.post('/api/users', {
    username: user.username,
    displayName: user.displayName,
    password: temporary,
    roles: user.roles,
    branchIds: user.branchIds,
  })
  if (created.status() !== 201) throw new Error(`no se pudo crear ${user.username}: ${await created.text()}`)
  const { id } = (await created.json()) as { id: string }

  if (user.licenseNumber) {
    const profile = await admin.put(`/api/professionals/${id}`, { licenseNumber: user.licenseNumber })
    if (!profile.ok()) throw new Error(`no se pudo crear el perfil profesional: ${await profile.text()}`)
  }

  const session = await apiLogin(user.username, temporary)
  const changed = await session.post('/api/auth/change-password', {
    currentPassword: temporary,
    newPassword: user.password,
  })
  await session.dispose()
  if (changed.status() !== 204) throw new Error(`no se pudo fijar la clave de ${user.username}`)
  return id
}
