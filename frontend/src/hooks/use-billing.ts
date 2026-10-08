'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Account, type Debtor, type Payment, type PaymentMethod, type PerformedService } from '@/lib/api'

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

export function useRecordService(patientId: string) {
  return useBillingMutation(patientId, (practiceId: string) =>
    api.post<PerformedService>(`/api/patients/${patientId}/services`, { practiceId }),
  )
}

export interface PaymentInput {
  amount: string
  method: PaymentMethod
  externalReference?: string
  serviceIds?: string[]
}

export function useRecordPayment(patientId: string) {
  return useBillingMutation(patientId, (input: PaymentInput) =>
    api.post<Payment>(`/api/patients/${patientId}/payments`, input),
  )
}

export function useVoid(patientId: string, kind: 'services' | 'payments') {
  return useBillingMutation(patientId, ({ id, reason }: { id: string; reason: string }) =>
    api.post(`/api/patients/${patientId}/${kind}/${id}/void`, { reason }),
  )
}
