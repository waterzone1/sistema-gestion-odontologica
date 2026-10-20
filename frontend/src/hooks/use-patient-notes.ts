'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type PatientNote } from '@/lib/api'

const notesKey = (patientId: string) => ['patient-notes', patientId] as const

export function usePatientNotes(patientId: string, archived = false) {
  return useQuery({
    queryKey: [...notesKey(patientId), archived],
    queryFn: () => api.get<PatientNote[]>(`/api/patients/${patientId}/notes${archived ? '?archived=true' : ''}`),
  })
}

function useNoteMutation<V>(patientId: string, run: (variables: V) => Promise<PatientNote>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: () => client.invalidateQueries({ queryKey: notesKey(patientId) }),
  })
}

export function useAddPatientNote(patientId: string) {
  return useNoteMutation(patientId, (content: string) =>
    api.post<PatientNote>(`/api/patients/${patientId}/notes`, { content }),
  )
}

export function useArchivePatientNote(patientId: string) {
  return useNoteMutation(patientId, (noteId: string) =>
    api.post<PatientNote>(`/api/patients/${patientId}/notes/${noteId}/archive`),
  )
}
