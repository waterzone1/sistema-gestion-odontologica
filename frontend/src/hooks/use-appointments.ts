'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, type Appointment } from '@/lib/api'

export const appointmentsKey = ['appointments'] as const

interface AppointmentFilters {
  from: string
  to: string
  branchId?: string
  professionalId?: string
  patientId?: string
}

export function useAppointments(filters: AppointmentFilters, enabled = true) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to })
  if (filters.branchId) params.set('branchId', filters.branchId)
  if (filters.professionalId) params.set('professionalId', filters.professionalId)
  if (filters.patientId) params.set('patientId', filters.patientId)
  return useQuery({
    queryKey: [...appointmentsKey, filters],
    queryFn: () => api.get<Appointment[]>(`/api/appointments?${params.toString()}`),
    placeholderData: keepPreviousData,
    enabled,
  })
}
