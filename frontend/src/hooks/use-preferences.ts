'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionKey } from '@/hooks/use-session'
import { api, type SessionResponse, type SessionUser } from '@/lib/api'
import type { ThemePreference } from '@/lib/theme'

type Preferences = SessionUser['preferences']

interface PreferencesPatch {
  theme?: ThemePreference
  preferences?: Partial<Preferences>
}

export function useSavePreferences() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: PreferencesPatch) => api.put('/api/auth/preferences', patch),
    onSuccess: (_, patch) =>
      client.setQueryData<SessionResponse | null>(sessionKey, (current) =>
        current
          ? {
              ...current,
              user: {
                ...current.user,
                ...(patch.theme ? { theme: patch.theme } : {}),
                preferences: { ...current.user.preferences, ...patch.preferences },
              },
            }
          : current,
      ),
  })
}
