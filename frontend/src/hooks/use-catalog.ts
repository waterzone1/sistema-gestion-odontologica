'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

export interface ProfessionalInput {
  licenseNumber: string
  phone?: string | null
  email?: string | null
  practiceIds?: string[]
  active?: boolean
}

export function useSaveProfessional(userId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: ProfessionalInput) => api.put<Professional>(`/api/professionals/${userId}`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: professionalsKey }),
  })
}
