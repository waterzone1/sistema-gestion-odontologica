'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pendingBillingKey } from '@/hooks/use-billing'
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

type CloseInput = { kind: 'TREATMENT_SESSION'; treatmentItemId: string } | { kind: 'NO_CHARGE'; reason: string }

function useAppointmentAction<V>(run: (variables: V) => Promise<Appointment>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: appointmentsKey }),
        client.invalidateQueries({ queryKey: pendingBillingKey }),
      ]),
  })
}

export function useCloseAppointment(appointmentId: string) {
  return useAppointmentAction((input: CloseInput) =>
    api.post<Appointment>(`/api/appointments/${appointmentId}/close`, input),
  )
}

export function useReactivateAppointment(appointmentId: string) {
  return useAppointmentAction((acknowledgeWarnings: boolean) =>
    api.post<Appointment>(`/api/appointments/${appointmentId}/reactivate`, { acknowledgeWarnings }),
  )
}
