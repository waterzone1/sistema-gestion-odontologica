'use client'

import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useSession } from '@/hooks/use-session'
import { api, type Agreement, type CoverageProvider, type CoverageQuote, type PatientCoverage } from '@/lib/api'

const providersKey = ['coverages'] as const
const agreementsKey = (planId: string) => ['agreements', planId] as const
const patientCoveragesKey = (patientId: string) => ['patient-coverages', patientId] as const
const quoteKey = (patientId: string) => ['coverage-quote', patientId] as const

export function useCoverageProviders(enabled = true) {
  return useQuery({ queryKey: providersKey, queryFn: () => api.get<CoverageProvider[]>('/api/coverages'), enabled })
}

export function useAgreements(planId: string | null) {
  return useQuery({
    queryKey: agreementsKey(planId ?? ''),
    queryFn: () => api.get<Agreement[]>(`/api/coverages/plans/${planId ?? ''}/agreements`),
    enabled: planId !== null,
  })
}

function useCoverageMutation<V, T>(run: (variables: V) => Promise<T>, keys: (variables: V) => QueryKey[]) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: (_, variables) => Promise.all(keys(variables).map((queryKey) => client.invalidateQueries({ queryKey }))),
  })
}

export interface ProviderInput {
  id?: string
  name?: string
  kind?: CoverageProvider['kind']
  active?: boolean
}

export function useSaveProvider() {
  return useCoverageMutation(
    ({ id, ...body }: ProviderInput) =>
      id ? api.patch<CoverageProvider>(`/api/coverages/providers/${id}`, body) : api.post<CoverageProvider>('/api/coverages/providers', body),
    () => [providersKey],
  )
}

export function useSavePlan() {
  return useCoverageMutation(
    ({ providerId, planId, ...body }: { providerId?: string; planId?: string; name?: string; code?: string; active?: boolean }) =>
      planId
        ? api.patch<CoverageProvider>(`/api/coverages/plans/${planId}`, body)
        : api.post<CoverageProvider>(`/api/coverages/providers/${providerId ?? ''}/plans`, body),
    () => [providersKey],
  )
}

export interface AgreementItemInput {
  practiceId: string
  insurerAmount: string
  patientCopay: string
  requiresAuthorization: boolean
}

export function useSaveAgreement(planId: string) {
  return useCoverageMutation(
    ({ id, ...body }: { id?: string; validFrom?: string; validTo?: string | null; notes?: string; items?: AgreementItemInput[] }) =>
      id ? api.put<Agreement>(`/api/coverages/agreements/${id}`, body) : api.post<Agreement>(`/api/coverages/plans/${planId}/agreements`, body),
    () => [agreementsKey(planId)],
  )
}

export function usePatientCoverages(patientId: string) {
  return useQuery({
    queryKey: patientCoveragesKey(patientId),
    queryFn: () => api.get<PatientCoverage[]>(`/api/patients/${patientId}/coverages`),
  })
}

export function useAddPatientCoverage(patientId: string) {
  return useCoverageMutation(
    (body: { planId: string; affiliateNumber: string; validFrom: string; validTo?: string; notes?: string }) =>
      api.post<PatientCoverage>(`/api/patients/${patientId}/coverages`, body),
    () => [patientCoveragesKey(patientId), quoteKey(patientId)],
  )
}

export function useArchivePatientCoverage(patientId: string) {
  return useCoverageMutation(
    (coverageId: string) => api.post<PatientCoverage>(`/api/patients/${patientId}/coverages/${coverageId}/archive`),
    () => [patientCoveragesKey(patientId), quoteKey(patientId)],
  )
}

export function useCoverageQuote(patientId: string, practiceId: string | null) {
  const enabled = useSession().data?.user.modules.coverages ?? false
  return useQuery({
    queryKey: [...quoteKey(patientId), practiceId],
    queryFn: () => api.get<CoverageQuote>(`/api/patients/${patientId}/coverage-quote?practiceId=${practiceId ?? ''}`),
    enabled: enabled && practiceId !== null && practiceId !== '',
  })
}
