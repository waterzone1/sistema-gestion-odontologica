'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AgendaAvailability, type AvailabilityExceptionResult, type ProfessionalAvailability } from '@/lib/api'

const availabilityKey = ['availability'] as const

export function useProfessionalAvailability(professionalId: string) {
  return useQuery({
    queryKey: [...availabilityKey, 'professional', professionalId],
    queryFn: () => api.get<ProfessionalAvailability>(`/api/professionals/${professionalId}/availability`),
  })
}

export function useAgendaAvailability(
  filters: { from: string; to: string; branchId: string; professionalId?: string },
  enabled: boolean,
) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to, branchId: filters.branchId })
  if (filters.professionalId) params.set('professionalId', filters.professionalId)
  return useQuery({
    queryKey: [...availabilityKey, 'agenda', filters],
    queryFn: () => api.get<AgendaAvailability>(`/api/availability?${params.toString()}`),
    placeholderData: keepPreviousData,
    enabled,
  })
}

function useAvailabilityMutation<T, V>(run: (variables: V) => Promise<T>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: () => client.invalidateQueries({ queryKey: availabilityKey }),
  })
}

export interface RuleInput {
  branchId: string
  weekday: number
  start: string
  end: string
}

export function useSaveRules(professionalId: string) {
  return useAvailabilityMutation((rules: RuleInput[]) =>
    api.put<ProfessionalAvailability>(`/api/professionals/${professionalId}/availability/rules`, { rules }),
  )
}

export interface ExceptionInput {
  type: 'BLOCK' | 'VACATION' | 'ABSENCE' | 'EXTRA'
  branchId: string | null
  startsAt: string
  endsAt: string
  reason: string
}

export function useCreateException(professionalId: string) {
  return useAvailabilityMutation((input: ExceptionInput) =>
    api.post<AvailabilityExceptionResult>(`/api/professionals/${professionalId}/exceptions`, input),
  )
}

export function useRevokeException(professionalId: string) {
  return useAvailabilityMutation((exceptionId: string) =>
    api.post(`/api/professionals/${professionalId}/exceptions/${exceptionId}/revoke`),
  )
}
