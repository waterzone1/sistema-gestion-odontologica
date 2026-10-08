'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, UserRound, Users } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { sessionKey, useSession } from '@/hooks/use-session'
import { api } from '@/lib/api'
import { can, ROLE_LABELS } from '@/lib/permissions'

export default function DashboardPage() {
  const client = useQueryClient()
  const session = useSession()
  const dismiss = useMutation({
    mutationFn: () => api.post('/api/auth/onboarding/complete'),
    onSuccess: () => client.invalidateQueries({ queryKey: sessionKey }),
  })

  const user = session.data?.user
  if (!user) return null

  const shortcuts = [
    { href: '/patients', label: 'Pacientes', description: 'Buscar, dar de alta y ver fichas', icon: UserRound, show: can(user, 'patients:read') },
    { href: '/admin/users', label: 'Usuarios', description: 'Altas, roles y accesos', icon: Users, show: can(user, 'users:manage') },
    { href: '/admin/branches', label: 'Sedes', description: 'Sedes de la organización', icon: Building2, show: can(user, 'branches:manage') },
  ].filter((s) => s.show)

  return (
    <>
      <PageHeader
        title={`Hola, ${user.displayName}`}
        description="Este es tu panel de inicio."
        actions={
          <div className="flex flex-wrap gap-1">
            {user.roles.map((role) => (
              <Badge key={role}>{ROLE_LABELS[role]}</Badge>
            ))}
          </div>
        }
      />

      {!user.onboardingCompleted && (
        <Alert variant="info" title="Bienvenido/a al sistema" className="mb-6">
          <p>
            Desde el menú vas a acceder a las secciones que tu rol tiene habilitadas. A medida que se sumen
            módulos, van a aparecer acá.
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => dismiss.mutate()} disabled={dismiss.isPending}>
            Entendido
          </Button>
        </Alert>
      )}

      {shortcuts.length > 0 ? (
        <section aria-label="Accesos directos" className="grid gap-3 sm:grid-cols-2">
          {shortcuts.map(({ href, label, description, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-muted">
              <Icon className="size-5 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{description}</span>
              </span>
            </Link>
          ))}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay secciones disponibles para tu rol.</p>
      )}
    </>
  )
}
