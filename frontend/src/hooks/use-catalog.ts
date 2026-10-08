'use client'

import { useQuery } from '@tanstack/react-query'
import { api, type Practice, type Professional } from '@/lib/api'

export const practicesKey = ['practices'] as const
const professionalsKey = ['professionals'] as const

export function usePractices(status: 'active' | 'all' = 'active', enabled = true) {
  return useQuery({
    queryKey: [...practicesKey, status],
    queryFn: () => api.get<Practice[]>(`/api/practices?status=${status}`),
    enabled,
  })
}

export function useProfessionals(enabled = true) {
  return useQuery({
    queryKey: professionalsKey,
    queryFn: () => api.get<Professional[]>('/api/professionals'),
    enabled,
  })
}
