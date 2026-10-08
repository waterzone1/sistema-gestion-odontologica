'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AppointmentDialog } from '@/components/appointments/appointment-dialog'
import { FormError } from '@/components/form-error'
import { Badge } from '@/components/ui/badge'
import { useAppointments } from '@/hooks/use-appointments'
import type { Appointment, SessionUser } from '@/lib/api'
import { dayRange, STATUS_LABELS, STATUS_VARIANT } from '@/lib/appointments'
import { formatTime } from '@/lib/format'
import { can } from '@/lib/permissions'

export function TodayAppointments({ user }: { user: SessionUser }) {
  const [today] = useState(() => dayRange(new Date()))
  const appointments = useAppointments(today)
  const [selected, setSelected] = useState<Appointment | null>(null)

  const items = (appointments.data ?? []).filter((a) => a.status !== 'CANCELLED')
  const own = !can(user, 'appointments:manage')

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
        canManage={can(user, 'appointments:manage')}
        canAttend={can(user, 'appointments:attend')}
      />
    </section>
  )
}
