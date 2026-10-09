'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAppointments } from '@/hooks/use-appointments'
import { dayRange } from '@/lib/appointments'
import { formatTime } from '@/lib/format'

export function DentistPanel() {
  const [today] = useState(() => dayRange(new Date()))
  const [now] = useState(() => Date.now())
  const appointments = useAppointments(today)
  const items = appointments.data ?? []

  const next = items.find(
    (a) => (a.status === 'SCHEDULED' || a.status === 'CONFIRMED') && new Date(a.endsAt).getTime() >= now,
  )
  const undocumented = items.filter((a) => a.status === 'ATTENDED' && a.hasClinicalNote === false)

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <section aria-labelledby="proximo-paciente" className="rounded-lg border bg-card p-5 shadow-sm">
        <h2 id="proximo-paciente" className="mb-2 text-sm font-semibold">
          Próximo paciente
        </h2>
        {appointments.isPending ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : next ? (
          <p className="text-sm">
            <span className="font-medium">{formatTime(next.startsAt)}</span>{' '}
            <Link href={`/patients/${next.patient.id}`} className="text-primary hover:underline">
              {next.patient.fullName}
            </Link>
            {next.practice && <span className="block text-xs text-muted-foreground">{next.practice.name}</span>}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No quedan pacientes por atender hoy.</p>
        )}
      </section>
      <section aria-labelledby="sin-nota" className="rounded-lg border bg-card p-5 shadow-sm">
        <h2 id="sin-nota" className="mb-2 text-sm font-semibold">
          Atenciones sin nota clínica
        </h2>
        {undocumented.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todas las atenciones de hoy tienen su nota.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {undocumented.map((appointment) => (
              <li key={appointment.id}>
                <span className="font-medium">{formatTime(appointment.startsAt)}</span>{' '}
                <Link href={`/patients/${appointment.patient.id}?tab=historia`} className="text-primary hover:underline">
                  {appointment.patient.fullName}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
