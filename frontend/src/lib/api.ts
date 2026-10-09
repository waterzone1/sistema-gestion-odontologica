import type { components, paths } from './api-types'

type Schemas = components['schemas']
export type SessionUser = Schemas['SessionUser']
export type SessionResponse = Schemas['SessionResponse']
export type User = Schemas['User']
export type Branch = Schemas['Branch']
export type Professional = Schemas['Professional']
export type Patient = Schemas['Patient']
export type PatientList = Schemas['PatientList']
export type Practice = Schemas['Practice']
export type ClinicalEntry = Schemas['ClinicalEntry']
export type PerformedService = Schemas['PerformedService']
export type Payment = Schemas['Payment']
export type PaymentMethod = Schemas['PaymentMethod']
export type MovementMethod = Schemas['MovementMethod']
export type Account = Schemas['Account']
export type Debtor = Schemas['Debtor']
export type ProfessionalAvailability = Schemas['ProfessionalAvailability']
export type AvailabilityException = Schemas['AvailabilityException']
export type AvailabilityExceptionResult = Schemas['AvailabilityExceptionResult']
export type AgendaAvailability = Schemas['AgendaAvailability']
export type Appointment = Schemas['Appointment']
export type AppointmentStatus = Schemas['AppointmentStatus']
export type Role = Schemas['Role']
export type Permission = SessionUser['permissions'][number]
export type HealthResponse =
  paths['/api/health']['get']['responses']['200']['content']['application/json']

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let csrfToken: string | null = null

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH'

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  if (res.status === 204) return undefined as T

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error
    throw new ApiError(
      res.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Ocurrió un error inesperado',
      error?.details,
    )
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T = void>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health', { cache: 'no-store' })
  if (res.status !== 200 && res.status !== 503) {
    throw new Error(`respuesta inesperada del servidor (${res.status})`)
  }
  return (await res.json()) as HealthResponse
}

export function passwordProblems(error: unknown): string[] {
  if (error instanceof ApiError && error.code === 'WEAK_PASSWORD') {
    const problemas = (error.details as { problemas?: unknown } | undefined)?.problemas
    if (Array.isArray(problemas)) return problemas.filter((p): p is string => typeof p === 'string')
  }
  return []
}

export const SERVER_UNREACHABLE = 'No se pudo conectar con el servidor.'

export function errorMessage(error: unknown): string | null {
  if (!error) return null
  return error instanceof ApiError ? error.message : SERVER_UNREACHABLE
}
