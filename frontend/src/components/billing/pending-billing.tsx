'use client'

import { ReceiptText } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { AppointmentDialog } from '@/components/appointments/appointment-dialog'
import { FormError } from '@/components/form-error'
import { Button, buttonVariants } from '@/components/ui/button'
import { usePendingBilling } from '@/hooks/use-billing'
import type { Appointment } from '@/lib/api'
import { formatDate, formatDateTime } from '@/lib/format'

export function PendingBilling() {
  const pending = usePendingBilling(true)
  const [open, setOpen] = useState<Appointment | null>(null)
  const appointments = pending.data?.appointments ?? []
  const items = pending.data?.items ?? []
  const total = appointments.length + items.length

  return (
    <section aria-labelledby="pendientes-de-facturar" className="mt-6 rounded-lg border bg-card p-5 shadow-sm">
      <h2 id="pendientes-de-facturar" className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <ReceiptText className="size-4" aria-hidden />
        Pendientes de facturar
        {total > 0 && <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{total}</span>}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Turnos atendidos sin prestación ni cierre, y prácticas que el odontólogo marcó realizadas.
      </p>
      <FormError error={pending.error} />
      {pending.isPending && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {pending.data && total === 0 && <p className="text-sm text-muted-foreground">No hay nada pendiente.</p>}
      {appointments.length > 0 && (
        <ul aria-label="Turnos atendidos sin cerrar" className="divide-y">
          {appointments.map((appointment) => (
            <li key={appointment.id} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span>
                <Link href={`/patients/${appointment.patient.id}`} className="text-primary hover:underline">
                  {appointment.patient.fullName}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {' '}
                  · Turno del {formatDateTime(appointment.startsAt)} · {appointment.professional.displayName}
                  {appointment.practice ? ` · ${appointment.practice.name}` : ''}
                </span>
              </span>
              <Button variant="outline" size="sm" onClick={() => setOpen(appointment)}>
                Cerrar turno
              </Button>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <ul aria-label="Prácticas realizadas sin prestación" className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span>
                <Link href={`/patients/${item.patient.id}`} className="text-primary hover:underline">
                  {item.patient.fullName}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {' '}
                  · {item.practice} realizada el {formatDate(item.completedAt)} · {item.professional}
                </span>
              </span>
              <Link
                href={`/patients/${item.patient.id}?tab=tratamiento`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Registrar prestación
              </Link>
            </li>
          ))}
        </ul>
      )}
      <AppointmentDialog
        appointment={open}
        onOpenChange={(value) => !value && setOpen(null)}
        canManage={false}
        canAttend={false}
      />
    </section>
  )
}
