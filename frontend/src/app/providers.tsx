'use client'

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ThemeSync } from '@/components/theme-sync'
import { sessionKey } from '@/hooks/use-session'
import { ApiError, setCsrfToken } from '@/lib/api'

function handleSessionLoss(client: QueryClient, error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    setCsrfToken(null)
    client.setQueryData(sessionKey, null)
  }
  if (error instanceof ApiError && error.code === 'PASSWORD_CHANGE_REQUIRED') {
    void client.invalidateQueries({ queryKey: sessionKey })
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const queryClient: QueryClient = new QueryClient({
      queryCache: new QueryCache({ onError: (error) => handleSessionLoss(queryClient, error) }),
      mutationCache: new MutationCache({ onError: (error) => handleSessionLoss(queryClient, error) }),
      defaultOptions: {
        queries: {
          staleTime: 10_000,
          retry: (count, error) => !(error instanceof ApiError) && count < 1,
        },
      },
    })
    return queryClient
  })
  return (
    <QueryClientProvider client={client}>
      <ThemeSync />
      {children}
    </QueryClientProvider>
  )
}
