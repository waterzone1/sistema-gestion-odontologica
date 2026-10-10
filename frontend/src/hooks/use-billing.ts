'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Account, type Debtor, type PaymentMethod, type PerformedService } from '@/lib/api'

const billingKey = (patientId: string) => ['billing', patientId] as const
const debtorsKey = ['debtors'] as const

export function useServices(patientId: string) {
  return useQuery({
    queryKey: [...billingKey(patientId), 'services'],
    queryFn: () => api.get<PerformedService[]>(`/api/patients/${patientId}/services`),
  })
}

export function useAccount(patientId: string) {
  return useQuery({
    queryKey: [...billingKey(patientId), 'account'],
    queryFn: () => api.get<Account>(`/api/patients/${patientId}/account`),
  })
}

export function useDebtors(enabled: boolean) {
  return useQuery({
    queryKey: debtorsKey,
    queryFn: () => api.get<Debtor[]>('/api/debtors'),
    enabled,
  })
}

function useBillingMutation<T, V>(patientId: string, run: (variables: V) => Promise<T>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: billingKey(patientId) }),
        client.invalidateQueries({ queryKey: debtorsKey }),
      ])
    },
  })
}

export interface ServiceInput {
  practiceId?: string
  treatmentItemId?: string
  professionalId?: string
  appointmentId?: string
  price?: string
  tooth?: number
  surfaces?: string[]
}

export function useRecordService(patientId: string) {
  const client = useQueryClient()
  return useBillingMutation(patientId, async (input: ServiceInput) => {
    const service = await api.post<PerformedService>(`/api/patients/${patientId}/services`, input)
    await Promise.all([
      client.invalidateQueries({ queryKey: ['treatment', patientId] }),
      client.invalidateQueries({ queryKey: ['odontogram', patientId] }),
    ])
    return service
  })
}

export function useAdjustPrice(patientId: string) {
  return useBillingMutation(patientId, ({ id, price }: { id: string; price: string }) =>
    api.post<PerformedService>(`/api/patients/${patientId}/services/${id}/price`, { price }),
  )
}

export interface ChargeInput {
  lines: { amount: string; method: PaymentMethod; externalReference?: string }[]
  credit?: string
  serviceIds?: string[]
}

export function useRecordCharge(patientId: string) {
  return useBillingMutation(patientId, (input: ChargeInput) => api.post(`/api/patients/${patientId}/payments`, input))
}

export function useVoid(patientId: string, kind: 'services' | 'payments' | 'credits') {
  return useBillingMutation(patientId, ({ id, reason }: { id: string; reason: string }) =>
    api.post(`/api/patients/${patientId}/${kind}/${id}/void`, { reason }),
  )
}
