import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiStatus } from '@/components/api-status'

function renderStatus() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ApiStatus />
    </QueryClientProvider>,
  )
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status, json: () => Promise.resolve(body) }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ApiStatus', () => {
  it('muestra el sistema operativo cuando el backend y la base responden', async () => {
    mockFetch(200, { status: 'ok', db: 'up', uptimeSeconds: 12 })
    renderStatus()
    expect(await screen.findByText('Servidor operativo')).toBeInTheDocument()
    expect(screen.getByText('Base de datos conectada')).toBeInTheDocument()
  })

  it('avisa cuando la base no responde', async () => {
    mockFetch(503, { status: 'degraded', db: 'down', uptimeSeconds: 12 })
    renderStatus()
    expect(await screen.findByText('Base de datos sin respuesta')).toBeInTheDocument()
  })

  it('ofrece reintentar si no se puede conectar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red')))
    renderStatus()
    expect(await screen.findByText('No se pudo conectar con el servidor.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
