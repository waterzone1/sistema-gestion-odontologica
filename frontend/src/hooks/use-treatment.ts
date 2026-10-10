'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type TreatmentPlan } from '@/lib/api'

const treatmentKey = (patientId: string) => ['treatment', patientId] as const

export function useTreatmentPlans(patientId: string, enabled = true) {
  return useQuery({
    queryKey: treatmentKey(patientId),
    queryFn: () => api.get<TreatmentPlan[]>(`/api/patients/${patientId}/treatment-plans`),
    enabled,
  })
}

function useTreatmentMutation<V>(patientId: string, run: (variables: V) => Promise<TreatmentPlan>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: treatmentKey(patientId) }),
        client.invalidateQueries({ queryKey: ['odontogram', patientId] }),
      ])
    },
  })
}

export function useCreatePlan(patientId: string) {
  return useTreatmentMutation(patientId, (title: string) =>
    api.post<TreatmentPlan>(`/api/patients/${patientId}/treatment-plans`, title ? { title } : {}),
  )
}

export interface ItemInput {
  planId: string
  practiceId: string
  tooth?: number
  surfaces: string[]
  notes: string
}

export function useAddItem(patientId: string) {
  return useTreatmentMutation(patientId, ({ planId, ...input }: ItemInput) =>
    api.post<TreatmentPlan>(`/api/patients/${patientId}/treatment-plans/${planId}/items`, input),
  )
}

export type ItemAction =
  | { kind: 'price'; planId: string; itemId: string; price: string }
  | { kind: 'start'; planId: string; itemId: string }
  | { kind: 'cancel'; planId: string; itemId: string; reason: string }
  | { kind: 'accept'; planId: string }

export function useItemAction(patientId: string) {
  return useTreatmentMutation(patientId, (action: ItemAction) => {
    const base = `/api/patients/${patientId}/treatment-plans/${action.planId}`
    switch (action.kind) {
      case 'price':
        return api.put<TreatmentPlan>(`${base}/items/${action.itemId}/price`, { price: action.price })
      case 'start':
        return api.post<TreatmentPlan>(`${base}/items/${action.itemId}/start`)
      case 'cancel':
        return api.post<TreatmentPlan>(`${base}/items/${action.itemId}/cancel`, { reason: action.reason })
      case 'accept':
        return api.post<TreatmentPlan>(`${base}/accept`)
    }
  })
}
