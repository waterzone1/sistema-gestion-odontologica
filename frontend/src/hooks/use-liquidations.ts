'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Liquidation, type LiquidationSummary } from '@/lib/api'

const liquidationsKey = ['liquidations'] as const

export function useLiquidations(enabled: boolean) {
  return useQuery({ queryKey: liquidationsKey, queryFn: () => api.get<LiquidationSummary[]>('/api/liquidations'), enabled })
}

export function useLiquidation(id: string, enabled: boolean) {
  return useQuery({ queryKey: [...liquidationsKey, id], queryFn: () => api.get<Liquidation>(`/api/liquidations/${id}`), enabled })
}

export function useCreateLiquidation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { providerId: string; periodFrom: string; periodTo: string }) => api.post<Liquidation>('/api/liquidations', body),
    onSuccess: () => client.invalidateQueries({ queryKey: liquidationsKey }),
  })
}

export type LiquidationAction =
  | { kind: 'submit' }
  | { kind: 'result'; itemId: string; status: 'APPROVED' }
  | { kind: 'result'; itemId: string; status: 'DEBITED'; approvedAmount: string; reason: string }
  | { kind: 'result'; itemId: string; status: 'REJECTED'; reason: string }
  | { kind: 'payment'; amount: string; reference?: string }
  | { kind: 'cancel'; reason: string }

export function useLiquidationAction(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (action: LiquidationAction) => {
      const base = `/api/liquidations/${id}`
      switch (action.kind) {
        case 'submit':
          return api.post<Liquidation>(`${base}/submit`)
        case 'result':
          return api.post<Liquidation>(`${base}/items/${action.itemId}/result`, {
            status: action.status,
            ...('approvedAmount' in action ? { approvedAmount: action.approvedAmount } : {}),
            ...('reason' in action ? { reason: action.reason } : {}),
          })
        case 'payment':
          return api.post<Liquidation>(`${base}/payment`, { amount: action.amount, ...(action.reference ? { reference: action.reference } : {}) })
        case 'cancel':
          return api.post<Liquidation>(`${base}/cancel`, { reason: action.reason })
      }
    },
    onSuccess: (data) => {
      client.setQueryData([...liquidationsKey, id], data)
      return client.invalidateQueries({ queryKey: liquidationsKey, exact: true })
    },
  })
}
