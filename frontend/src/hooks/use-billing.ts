'use client'

import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import {
  api,
  type Account,
  type CashDay,
  type Currency,
  type Debtor,
  type ExchangeRates,
  type PaymentMethod,
  type PendingBilling,
  type PerformedService,
} from '@/lib/api'

const billingKey = (patientId: string) => ['billing', patientId] as const
const debtorsKey = ['debtors'] as const
export const pendingBillingKey = ['billing-pending'] as const

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

const serviceKeys = (patientId: string): QueryKey[] => [
  pendingBillingKey,
  ['appointments'],
  ['treatment', patientId],
  ['odontogram', patientId],
]
const cashKey = ['cash'] as const

function useBillingMutation<T, V>(patientId: string, run: (variables: V) => Promise<T>, related: QueryKey[] = []) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await Promise.all(
        [billingKey(patientId), debtorsKey, ...related].map((queryKey) => client.invalidateQueries({ queryKey })),
      )
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
  return useBillingMutation(
    patientId,
    (input: ServiceInput) => api.post<PerformedService>(`/api/patients/${patientId}/services`, input),
    serviceKeys(patientId),
  )
}

export function usePendingBilling(enabled: boolean) {
  return useQuery({
    queryKey: pendingBillingKey,
    queryFn: () => api.get<PendingBilling>('/api/billing/pending'),
    enabled,
  })
}

export function useAdjustPrice(patientId: string) {
  return useBillingMutation(patientId, ({ id, price }: { id: string; price: string }) =>
    api.post<PerformedService>(`/api/patients/${patientId}/services/${id}/price`, { price }),
  )
}

export interface ChargeInput {
  lines: { amount: string; currency: Currency; method: PaymentMethod; externalReference?: string }[]
  exchangeRate?: string
  credit?: string
  serviceIds?: string[]
}

export function useRecordCharge(patientId: string) {
  return useBillingMutation(patientId, (input: ChargeInput) => api.post(`/api/patients/${patientId}/payments`, input), [
    cashKey,
  ])
}

export function useVoid(patientId: string, kind: 'services' | 'payments' | 'credits') {
  return useBillingMutation(
    patientId,
    ({ id, reason }: { id: string; reason: string }) => api.post(`/api/patients/${patientId}/${kind}/${id}/void`, { reason }),
    kind === 'services' ? serviceKeys(patientId) : [cashKey],
  )
}

const exchangeRatesKey = ['exchange-rates'] as const

export function useExchangeRates(enabled: boolean) {
  return useQuery({
    queryKey: exchangeRatesKey,
    queryFn: () => api.get<ExchangeRates>('/api/exchange-rates'),
    enabled,
  })
}

export function useSetExchangeRate() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (rate: string) => api.post<ExchangeRates>('/api/exchange-rates', { rate }),
    onSuccess: (data) => client.setQueryData(exchangeRatesKey, data),
  })
}

export function useCashDay(date: string) {
  return useQuery({
    queryKey: [...cashKey, date],
    queryFn: () => api.get<CashDay>(`/api/cash?date=${date}`),
  })
}
