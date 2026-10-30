'use client'

import { CalendarPlus, UserPlus, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AppointmentFormDialog, type AppointmentDefaults } from '@/components/appointments/appointment-form-dialog'
import { PatientFormDialog } from '@/components/patients/patient-form-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { useBranches } from '@/hooks/use-admin'
import { useAppointments } from '@/hooks/use-appointments'
import { usePractices, useProfessionals } from '@/hooks/use-catalog'
import type { SessionUser } from '@/lib/api'
import { dayRange } from '@/lib/appointments'
import { formatTime } from '@/lib/format'
import { can, visibleBranches } from '@/lib/permissions'

function NextPatient() {
  const [today] = useState(() => dayRange(new Date()))
  const [now] = useState(() => Date.now())
  const appointments = useAppointments(today)
  const next = (appointments.data ?? []).find(
    (a) => (a.status === 'SCHEDULED' || a.status === 'CONFIRMED') && new Date(a.endsAt).getTime() >= now,
  )
  if (!next) return <span className="hidden text-sm text-muted-foreground sm:inline">No quedan pacientes hoy</span>
  return (
    <Link href={`/patients/${next.patient.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
      <UserRound className="size-4" aria-hidden />
      <span className="hidden sm:inline">Próximo:</span> {formatTime(next.startsAt)} {next.patient.fullName}
    </Link>
  )
}

function NewAppointment({ user }: { user: SessionUser }) {
  const [creating, setCreating] = useState<AppointmentDefaults | null>(null)
  const branches = useBranches(creating !== null)
  const professionals = useProfessionals(creating !== null)
  const practices = usePractices('active', creating !== null)
  const ready = branches.data && professionals.data && practices.data
  return (
    <>
      <Button size="sm" onClick={() => setCreating({ start: nextSlot(), durationMinutes: 30 })}>
        <CalendarPlus className="size-4" aria-hidden />
        <span className="hidden sm:inline">Nuevo turno</span>
      </Button>
      {ready && (
        <AppointmentFormDialog
          open={creating !== null}
          onOpenChange={(open) => !open && setCreating(null)}
          appointment={null}
          defaults={creating}
          branches={visibleBranches(user, branches.data)}
          professionals={professionals.data}
          practices={practices.data}
        />
      )}
    </>
  )
}

function NewPatient() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" aria-hidden />
        <span className="hidden sm:inline">Nuevo paciente</span>
      </Button>
      <PatientFormDialog open={open} onOpenChange={setOpen} patient={null} onSaved={(created) => router.push(`/patients/${created.id}`)} />
    </>
  )
}

function nextSlot(): Date {
  const now = new Date()
  now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0)
  return now
}

export function QuickActions({ user, pathname }: { user: SessionUser; pathname: string }) {
  return (
    <div data-tour="quick-actions" className="flex min-w-0 flex-wrap items-center gap-2">
      {can(user, 'appointments:manage') && !pathname.startsWith('/agenda') && !pathname.startsWith('/patients/') && <NewAppointment user={user} />}
      {can(user, 'patients:write') && pathname !== '/patients' && <NewPatient />}
      {can(user, 'clinical:read') && <NextPatient />}
    </div>
  )
}
