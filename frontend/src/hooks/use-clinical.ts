'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ClinicalEntry, type ClinicalFile, type ClinicalProfile } from '@/lib/api'

const clinicalKey = (patientId: string) => ['clinical', patientId] as const

export function useClinicalEntries(patientId: string) {
  return useQuery({
    queryKey: clinicalKey(patientId),
    queryFn: () => api.get<ClinicalEntry[]>(`/api/patients/${patientId}/clinical`),
    refetchOnWindowFocus: false,
    gcTime: 0,
  })
}

export function useAddClinicalEntry(patientId: string, correctionOfId?: string) {
  const client = useQueryClient()
  const path = `/api/patients/${patientId}/clinical${correctionOfId ? `/${correctionOfId}/corrections` : ''}`
  return useMutation({
    mutationFn: (input: { content: string; appointmentId?: string }) => api.post<ClinicalEntry>(path, input),
    onSuccess: () => client.invalidateQueries({ queryKey: clinicalKey(patientId) }),
  })
}

const profileKey = (patientId: string) => ['clinical-profile', patientId] as const

export function useClinicalProfile(patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: profileKey(patientId),
    queryFn: () => api.get<ClinicalProfile>(`/api/patients/${patientId}/clinical/profile`),
    refetchOnWindowFocus: false,
    gcTime: 0,
    enabled,
  })
}

export interface ClinicalProfileInput {
  alerts: string
  allergies: string
  medications: string
  background: string
}

export function useSaveClinicalProfile(patientId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: ClinicalProfileInput) =>
      api.put<ClinicalProfile>(`/api/patients/${patientId}/clinical/profile`, input),
    onSuccess: (profile) => client.setQueryData(profileKey(patientId), profile),
  })
}

const filesKey = (patientId: string) => ['clinical-files', patientId] as const

export function useClinicalFiles(patientId: string, archived: boolean) {
  return useQuery({
    queryKey: [...filesKey(patientId), archived],
    queryFn: () => api.get<ClinicalFile[]>(`/api/patients/${patientId}/files?archived=${archived}`),
    refetchOnWindowFocus: false,
  })
}

export interface FileUpload {
  file: File
  category: ClinicalFile['category']
  description: string
}

export function useUploadClinicalFile(patientId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ file, category, description }: FileUpload) => {
      const query = new URLSearchParams({ filename: file.name, category })
      if (description.trim()) query.set('description', description.trim())
      return api.upload<ClinicalFile>(`/api/patients/${patientId}/files?${query.toString()}`, file)
    },
    onSuccess: () => client.invalidateQueries({ queryKey: filesKey(patientId) }),
  })
}

export function useArchiveClinicalFile(patientId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (fileId: string) => api.post<ClinicalFile>(`/api/patients/${patientId}/files/${fileId}/archive`),
    onSuccess: () => client.invalidateQueries({ queryKey: filesKey(patientId) }),
  })
}
