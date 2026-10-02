'use client'

import { useQuery } from '@tanstack/react-query'
import { api, type Branch, type User } from '@/lib/api'

export const usersKey = ['users'] as const
export const branchesKey = ['branches'] as const

export function useUsers(enabled = true) {
  return useQuery({ queryKey: usersKey, queryFn: () => api.get<User[]>('/api/users'), enabled })
}

export function useBranches(enabled = true) {
  return useQuery({ queryKey: branchesKey, queryFn: () => api.get<Branch[]>('/api/branches'), enabled })
}
