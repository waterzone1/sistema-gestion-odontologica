'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sessionKey } from '@/hooks/use-session'
import { api, type Organization, type OrganizationSettings } from '@/lib/api'

const organizationKey = ['organization'] as const

export function useOrganization() {
  return useQuery({ queryKey: organizationKey, queryFn: () => api.get<Organization>('/api/organization') })
}

export function useSaveSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (settings: Partial<OrganizationSettings>) => api.put<Organization>('/api/organization/settings', settings),
    onSuccess: async (organization) => {
      client.setQueryData(organizationKey, organization)
      await client.invalidateQueries({ queryKey: ['backups'] })
    },
  })
}

export function useUpdateOrganization() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { name?: string; timezone?: string }) => api.patch<Organization>('/api/organization', input),
    onSuccess: async (organization) => {
      client.setQueryData(organizationKey, organization)
      await client.invalidateQueries({ queryKey: sessionKey })
    },
  })
}
