'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, type Patient, type PatientList } from '@/lib/api'

export const patientsKey = ['patients'] as const

interface PatientFilters {
  q: string
  status: 'active' | 'archived' | 'all'
  page: number
  pageSize?: number
}

export function usePatients(filters: PatientFilters, enabled = true) {
  const params = new URLSearchParams({
    status: filters.status,
    page: String(filters.page),
    pageSize: String(filters.pageSize ?? 20),
  })
  if (filters.q) params.set('q', filters.q)
  return useQuery({
    queryKey: [...patientsKey, 'list', filters],
    queryFn: () => api.get<PatientList>(`/api/patients?${params.toString()}`),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: [...patientsKey, 'detail', id],
    queryFn: () => api.get<Patient>(`/api/patients/${id}`),
  })
}
