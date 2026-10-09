'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AppointmentDialog } from '@/components/appointments/appointment-dialog'
import { AppointmentFormDialog } from '@/components/appointments/appointment-form-dialog'
import { FormError } from '@/components/form-error'
import { Badge } from '@/components/ui/badge'
import { useBranches } from '@/hooks/use-admin'
import { useAppointments } from '@/hooks/use-appointments'
import { usePractices, useProfessionals } from '@/hooks/use-catalog'
import type { Appointment, SessionUser } from '@/lib/api'
import { dayRange, STATUS_LABELS, STATUS_VARIANT } from '@/lib/appointments'
import { formatTime } from '@/lib/format'
import { can, visibleBranches } from '@/lib/permissions'

export function TodayAppointments({ user }: { user: SessionUser }) {
  const [today] = useState(() => dayRange(new Date()))
  const appointments = useAppointments(today)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [editing, setEditing] = useState<Appointment | null>(null)
  const canManage = can(user, 'appointments:manage')
  const branches = useBranches(canManage)
  const professionals = useProfessionals(canManage)
  const practices = usePractices('active', canManage)

  const items = (appointments.data ?? []).filter((a) => a.status !== 'CANCELLED')
  const own = !canManage

  return (
    <section aria-labelledby="turnos-hoy" className="mt-6 rounded-lg border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="turnos-hoy" className="text-sm font-semibold">
          {own ? 'Mi jornada de hoy' : 'Turnos de hoy'}
        </h2>
        <Link href="/agenda" className="text-sm text-primary hover:underline">
          Ver agenda
        </Link>
      </div>

      <FormError error={appointments.error} />
      {appointments.isPending && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {appointments.data && items.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay turnos para hoy.</p>
      )}

      {items.length > 0 && (
        <ul className="divide-y">
          {items.map((appointment) => (
            <li key={appointment.id}>
              <button
                type="button"
                onClick={() => setSelected(appointment)}
                className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm hover:bg-muted/50"
              >
                <span>
                  <span className="font-medium">{formatTime(appointment.startsAt)}</span>{' '}
                  {appointment.patient.fullName}
                  <span className="block text-xs text-muted-foreground">
                    {[appointment.professional.displayName, appointment.practice?.name].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Badge variant={STATUS_VARIANT[appointment.status]}>{STATUS_LABELS[appointment.status]}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      <AppointmentDialog
        appointment={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        canManage={canManage}
        canAttend={can(user, 'appointments:attend')}
        onEdit={(appointment) => {
          setSelected(null)
          setEditing(appointment)
        }}
      />
      <AppointmentFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        appointment={editing}
        defaults={null}
        branches={visibleBranches(user, branches.data ?? [])}
        professionals={professionals.data ?? []}
        practices={practices.data ?? []}
      />
    </section>
  )
}
