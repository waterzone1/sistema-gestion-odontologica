'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ClinicalEntry } from '@/lib/api'

const clinicalKey = (patientId: string) => ['clinical', patientId] as const

export function useClinicalEntries(patientId: string) {
  return useQuery({
    queryKey: clinicalKey(patientId),
    queryFn: () => api.get<ClinicalEntry[]>(`/api/patients/${patientId}/clinical`),
    refetchOnWindowFocus: false,
    gcTime: 0,
  })
}

export function useAddClinicalEntry(patientId: string, correctionOfId?: string) {
  const client = useQueryClient()
  const path = `/api/patients/${patientId}/clinical${correctionOfId ? `/${correctionOfId}/corrections` : ''}`
  return useMutation({
    mutationFn: (content: string) => api.post<ClinicalEntry>(path, { content }),
    onSuccess: () => client.invalidateQueries({ queryKey: clinicalKey(patientId) }),
  })
}
