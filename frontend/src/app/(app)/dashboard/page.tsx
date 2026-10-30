'use client'

import { Building2, CalendarDays, ClipboardList, UserRound, Users } from 'lucide-react'
import Link from 'next/link'
import { Debtors } from '@/components/billing/debtors'
import { PendingBilling } from '@/components/billing/pending-billing'
import { ConfirmTomorrow } from '@/components/dashboard/confirm-tomorrow'
import { DentistPanel } from '@/components/dashboard/dentist-panel'
import { TodayAppointments } from '@/components/appointments/today-appointments'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { useSession } from '@/hooks/use-session'
import { can, ROLE_LABELS } from '@/lib/permissions'

export default function DashboardPage() {
  const session = useSession()

  const user = session.data?.user
  if (!user) return null

  const shortcuts = [
    { href: '/agenda', label: 'Agenda', description: 'Turnos por día y semana', icon: CalendarDays, show: can(user, 'appointments:read') },
    { href: '/admin/practices', label: 'Prácticas', description: 'Catálogo, duraciones y precios', icon: ClipboardList, show: can(user, 'practices:manage') },
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

      <div data-tour="dashboard-content" className="space-y-6">
      {can(user, 'clinical:read') && <DentistPanel />}
      {can(user, 'appointments:read') && <TodayAppointments user={user} />}
      {can(user, 'appointments:manage') && <ConfirmTomorrow />}
      {can(user, 'services:write') && <PendingBilling />}
      {can(user, 'account:read') && <Debtors />}
      </div>

      {shortcuts.length > 0 ? (
        <section aria-label="Accesos directos" className="mt-6 grid gap-3 sm:grid-cols-2">
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
