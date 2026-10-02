'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, setCsrfToken, type SessionResponse } from '@/lib/api'

export const sessionKey = ['session'] as const

export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: async (): Promise<SessionResponse | null> => {
      try {
        const session = await api.get<SessionResponse>('/api/auth/me')
        setCsrfToken(session.csrfToken)
        return session
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setCsrfToken(null)
          return null
        }
        throw error
      }
    },
    staleTime: 60_000,
    retry: false,
  })
}

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup-status'],
    queryFn: () => api.get<{ needsSetup: boolean }>('/api/setup/status'),
    staleTime: 30_000,
  })
}

export function useLogin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { username: string; password: string }) =>
      api.post<SessionResponse>('/api/auth/login', input),
    onSuccess: (session) => {
      setCsrfToken(session.csrfToken)
      client.setQueryData(sessionKey, session)
    },
  })
}

export function useLogout() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSettled: () => {
      setCsrfToken(null)
      client.clear()
      client.setQueryData(sessionKey, null)
    },
  })
}
