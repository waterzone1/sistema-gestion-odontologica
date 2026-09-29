import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '@/app/login/page'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

type Handler = (path: string, init?: { method?: string }) => { status: number; body?: unknown }

function mockApi(handler: Handler) {
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: { method?: string }) => {
      const { status, body } = handler(path, init)
      return Promise.resolve({
        status,
        ok: status >= 200 && status < 300,
        json: () => Promise.resolve(body),
      })
    }),
  )
}

function renderLogin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LoginPage />
    </QueryClientProvider>,
  )
}

const sinSesion = { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x', details: {} } } }

afterEach(() => {
  vi.unstubAllGlobals()
  replace.mockClear()
})

describe('pantalla de ingreso', () => {
  it('pide usuario y contraseña antes de enviar', async () => {
    mockApi((path) =>
      path === '/api/auth/me' ? sinSesion : path === '/api/setup/status' ? { status: 200, body: { needsSetup: false } } : { status: 200, body: { status: 'ok', db: 'up', uptimeSeconds: 1 } },
    )
    renderLogin()
    await userEvent.click(await screen.findByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('Ingresá tu usuario')).toBeInTheDocument()
    expect(screen.getByText('Ingresá tu contraseña')).toBeInTheDocument()
  })

  it('muestra el mensaje del servidor cuando las credenciales son incorrectas', async () => {
    mockApi((path, init) => {
      if (path === '/api/auth/login' && init?.method === 'POST') {
        return { status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña incorrectos', details: {} } } }
      }
      if (path === '/api/auth/me') return sinSesion
      if (path === '/api/setup/status') return { status: 200, body: { needsSetup: false } }
      return { status: 200, body: { status: 'ok', db: 'up', uptimeSeconds: 1 } }
    })
    renderLogin()
    await userEvent.type(await screen.findByLabelText('Usuario'), 'marta')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave-equivocada')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('Usuario o contraseña incorrectos')).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalledWith('/dashboard')
  })

  it('redirige a la configuracion inicial si la instalacion no esta configurada', async () => {
    mockApi((path) =>
      path === '/api/auth/me' ? sinSesion : path === '/api/setup/status' ? { status: 200, body: { needsSetup: true } } : { status: 200, body: { status: 'ok', db: 'up', uptimeSeconds: 1 } },
    )
    renderLogin()
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/setup'))
  })
})
