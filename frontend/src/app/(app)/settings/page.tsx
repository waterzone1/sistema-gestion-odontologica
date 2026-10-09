'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Monitor, Moon, Sun } from 'lucide-react'
import { FormError } from '@/components/form-error'
import { LoadingBlock, PageHeader } from '@/components/page-header'
import { sessionKey, useSession } from '@/hooks/use-session'
import { api, type SessionResponse } from '@/lib/api'
import { THEME_LABELS, type ThemePreference } from '@/lib/theme'
import { cn } from '@/lib/utils'

const THEME_ICONS = { SYSTEM: Monitor, LIGHT: Sun, DARK: Moon } as const

export default function SettingsPage() {
  const client = useQueryClient()
  const session = useSession()
  const save = useMutation({
    mutationFn: (theme: ThemePreference) => api.put('/api/auth/preferences', { theme }),
    onSuccess: (_, theme) =>
      client.setQueryData<SessionResponse | null>(sessionKey, (current) =>
        current ? { ...current, user: { ...current.user, theme } } : current,
      ),
  })

  const user = session.data?.user
  if (!user) return <LoadingBlock />

  return (
    <>
      <PageHeader title="Configuración" description="Preferencias de tu usuario. Se aplican en cualquier computadora donde ingreses." />
      <section aria-labelledby="tema" className="rounded-lg border bg-card p-5 shadow-sm">
        <h2 id="tema" className="mb-3 text-sm font-semibold">
          Tema
        </h2>
        <div role="radiogroup" aria-labelledby="tema" className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(THEME_LABELS) as ThemePreference[]).map((theme) => {
            const Icon = THEME_ICONS[theme]
            const selected = user.theme === theme
            return (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={save.isPending}
                onClick={() => save.mutate(theme)}
                className={cn(
                  'flex items-center gap-3 rounded-md border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-muted',
                  selected && 'border-primary bg-primary/10',
                )}
              >
                <Icon className="size-5 text-primary" aria-hidden />
                {THEME_LABELS[theme]}
              </button>
            )
          })}
        </div>
        <FormError error={save.error} className="mt-3" />
      </section>
    </>
  )
}
