import type { paths } from './api-types'

export type HealthResponse =
  paths['/api/health']['get']['responses']['200']['content']['application/json']

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health', { cache: 'no-store' })
  // con la base caida el backend responde 503 pero con el mismo cuerpo
  if (res.status !== 200 && res.status !== 503) {
    throw new Error(`respuesta inesperada del servidor (${res.status})`)
  }
  return (await res.json()) as HealthResponse
}
