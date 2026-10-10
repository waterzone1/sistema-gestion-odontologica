'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { appointmentsKey, useAppointments } from '@/hooks/use-appointments'
import { api, type Appointment } from '@/lib/api'
import { dayRange } from '@/lib/appointments'
import { formatTime } from '@/lib/format'

export function ConfirmTomorrow() {
  const client = useQueryClient()
  const [tomorrow] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    return dayRange(date)
  })
  const appointments = useAppointments(tomorrow)
  const confirm = useMutation({
    mutationFn: (appointment: Appointment) =>
      api.post<Appointment>(`/api/appointments/${appointment.id}/status`, { status: 'CONFIRMED' }),
    onSuccess: () => client.invalidateQueries({ queryKey: appointmentsKey }),
  })

  const pending = (appointments.data ?? []).filter((a) => a.status === 'SCHEDULED')

  return (
    <section aria-labelledby="confirmar-manana" className="mt-6 rounded-lg border bg-card p-5 shadow-sm">
      <h2 id="confirmar-manana" className="mb-3 text-sm font-semibold">
        Para confirmar mañana
      </h2>
      <FormError error={appointments.error ?? confirm.error} />
      {appointments.isPending && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {appointments.data && pending.length === 0 && (
        <p className="text-sm text-muted-foreground">No quedan turnos de mañana sin confirmar.</p>
      )}
      {pending.length > 0 && (
        <ul className="divide-y">
          {pending.map((appointment) => (
            <li key={appointment.id} className="flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0">
                <span className="font-medium">{formatTime(appointment.startsAt)}</span>{' '}
                <Link href={`/patients/${appointment.patient.id}`} className="text-primary hover:underline">
                  {appointment.patient.fullName}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {[appointment.professional.displayName, appointment.patient.phone ? `Tel. ${appointment.patient.phone}` : 'Sin teléfono']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                className="self-start sm:self-auto"
                disabled={confirm.isPending}
                onClick={() => confirm.mutate(appointment)}
              >
                Confirmar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
