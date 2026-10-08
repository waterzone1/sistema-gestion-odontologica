'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, type Patient, type PatientList } from '@/lib/api'

export const patientsKey = ['patients'] as const

interface PatientFilters {
  q: string
  status: 'active' | 'archived' | 'all'
  page: number
}

export function usePatients(filters: PatientFilters) {
  const params = new URLSearchParams({
    status: filters.status,
    page: String(filters.page),
    pageSize: '20',
  })
  if (filters.q) params.set('q', filters.q)
  return useQuery({
    queryKey: [...patientsKey, 'list', filters],
    queryFn: () => api.get<PatientList>(`/api/patients?${params.toString()}`),
    placeholderData: keepPreviousData,
  })
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: [...patientsKey, 'detail', id],
    queryFn: () => api.get<Patient>(`/api/patients/${id}`),
  })
}
