'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import {
  AppointmentFormDialog,
  type AppointmentDefaults,
} from '@/components/appointments/appointment-form-dialog'
import { AppointmentDialog } from '@/components/appointments/appointment-dialog'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useBranches } from '@/hooks/use-admin'
import { useAppointments } from '@/hooks/use-appointments'
import { usePractices, useProfessionals } from '@/hooks/use-catalog'
import type { Appointment, SessionUser } from '@/lib/api'
import { STATUS_LABELS, STATUS_VARIANT } from '@/lib/appointments'
import { formatDateTime } from '@/lib/format'
import { can, visibleBranches } from '@/lib/permissions'

const DAY_MS = 24 * 60 * 60 * 1000

interface Props {
  patient: { id: string; fullName: string; archived: boolean }
  user: SessionUser
}

export function PatientAppointments({ patient, user }: Props) {
  const canManage = can(user, 'appointments:manage')
  const canAttend = can(user, 'appointments:attend')
  const [range] = useState(() => {
    const now = Date.now()
    return {
      from: new Date(now - 180 * DAY_MS).toISOString(),
      to: new Date(now + 180 * DAY_MS).toISOString(),
      now,
    }
  })
  const appointments = useAppointments({ from: range.from, to: range.to, patientId: patient.id })
  const branches = useBranches()
  const professionals = useProfessionals()
  const practices = usePractices('active')

  const [creating, setCreating] = useState<AppointmentDefaults | null>(null)
  const [editing, setEditing] = useState<Appointment | null>(null)
  const [selected, setSelected] = useState<Appointment | null>(null)

  if (appointments.isPending) return <LoadingBlock />
  if (appointments.isError) return <FormError error={appointments.error} />

  const now = range.now
  const upcoming = appointments.data.filter(
    (a) => new Date(a.endsAt).getTime() >= now && (a.status === 'SCHEDULED' || a.status === 'CONFIRMED'),
  )
  const history = appointments.data
    .filter((a) => !upcoming.includes(a))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))

  const newAppointment = () => {
    const start = new Date()
    start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0)
    setCreating({ start, durationMinutes: 30, patient: { id: patient.id, fullName: patient.fullName } })
  }

  return (
    <div className="space-y-6">
      {canManage && !patient.archived && (
        <div className="flex justify-end">
          <Button onClick={newAppointment}>
            <Plus className="size-4" aria-hidden />
            Nuevo turno
          </Button>
        </div>
      )}

      <Section title="Próximos turnos" items={upcoming} onOpen={setSelected} empty="No tiene turnos próximos." />
      <Section title="Historial" items={history} onOpen={setSelected} empty="Todavía no tiene turnos anteriores." />

      <AppointmentDialog
        appointment={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        canManage={canManage}
        canAttend={canAttend}
        onEdit={(appointment) => {
          setSelected(null)
          setEditing(appointment)
        }}
      />
      <AppointmentFormDialog
        open={creating !== null || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(null)
            setEditing(null)
          }
        }}
        appointment={editing}
        defaults={creating}
        branches={visibleBranches(user, branches.data ?? [])}
        professionals={professionals.data ?? []}
        practices={practices.data ?? []}
      />
    </div>
  )
}

function Section({
  title,
  items,
  onOpen,
  empty,
}: {
  title: string
  items: Appointment[]
  onOpen: (appointment: Appointment) => void
  empty: string
}) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {items.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <ul className="divide-y rounded-lg border bg-card shadow-sm">
          {items.map((appointment) => (
            <li key={appointment.id}>
              <button
                type="button"
                onClick={() => onOpen(appointment)}
                className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm">
                  <span className="font-medium">{formatDateTime(appointment.startsAt)}</span>
                  <span className="text-muted-foreground">
                    {' · '}
                    {[appointment.professional.displayName, appointment.practice?.name, appointment.branch.name]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <Badge variant={STATUS_VARIANT[appointment.status]}>{STATUS_LABELS[appointment.status]}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
