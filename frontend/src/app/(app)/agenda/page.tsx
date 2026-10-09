'use client'

import type { DateSelectArg, DatesSetArg, EventClickArg } from '@fullcalendar/core'
import esLocale from '@fullcalendar/core/locales/es'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  AppointmentFormDialog,
  type AppointmentDefaults,
} from '@/components/appointments/appointment-form-dialog'
import { AppointmentDialog } from '@/components/appointments/appointment-dialog'
import { FormError } from '@/components/form-error'
import { LoadingBlock, PageHeader } from '@/components/page-header'
import { Select } from '@/components/ui/input'
import { useBranches } from '@/hooks/use-admin'
import { useAppointments } from '@/hooks/use-appointments'
import { usePractices, useProfessionals } from '@/hooks/use-catalog'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useSession } from '@/hooks/use-session'
import type { Appointment } from '@/lib/api'
import { formatTime } from '@/lib/format'
import { can, visibleBranches } from '@/lib/permissions'
import { Button } from '@/components/ui/button'

function nextSlot(): Date {
  const now = new Date()
  now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0)
  return now
}

export default function AgendaPage() {
  const router = useRouter()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'appointments:read')
  const canManage = can(user, 'appointments:manage')
  const canAttend = can(user, 'appointments:attend')
  const compact = useMediaQuery('(max-width: 1023px)')

  const branches = useBranches(allowed)
  const professionals = useProfessionals(allowed)
  const practices = usePractices('active', allowed)

  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [branchChoice, setBranchChoice] = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [creating, setCreating] = useState<AppointmentDefaults | null>(null)
  const [editing, setEditing] = useState<Appointment | null>(null)
  const [selected, setSelected] = useState<Appointment | null>(null)

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  const myBranches = user && branches.data ? visibleBranches(user, branches.data) : []
  const branchId = branchChoice || myBranches[0]?.id || ''
  const professionalOptions = (professionals.data ?? []).filter((p) => p.active && p.branchIds.includes(branchId))

  const appointments = useAppointments(
    { from: range?.from ?? '', to: range?.to ?? '', branchId, professionalId },
    allowed && range !== null && branchId !== '',
  )

  if (!user || !allowed || branches.isPending || professionals.isPending) return <LoadingBlock />

  const events = (appointments.data ?? [])
    .filter((a) => a.status !== 'CANCELLED')
    .map((a) => ({
      id: a.id,
      start: a.startsAt,
      end: a.endsAt,
      title: a.patient.fullName,
      classNames: [`fc-estado-${a.status.toLowerCase()}`],
      extendedProps: { appointment: a },
    }))

  const onDatesSet = (arg: DatesSetArg) => {
    const next = { from: arg.start.toISOString(), to: arg.end.toISOString() }
    setRange((prev) => (prev && prev.from === next.from && prev.to === next.to ? prev : next))
  }

  const onSelect = (arg: DateSelectArg) => {
    const minutes = Math.max(15, Math.round((arg.end.getTime() - arg.start.getTime()) / 60_000))
    setCreating({ start: arg.start, durationMinutes: minutes, branchId, professionalId })
  }

  const onEventClick = (arg: EventClickArg) => {
    setSelected(arg.event.extendedProps['appointment'] as Appointment)
  }

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Turnos de la sede elegida. Seleccioná un horario libre para crear un turno."
        actions={
          canManage && (
            <Button onClick={() => setCreating({ start: nextSlot(), durationMinutes: 30, branchId, professionalId })}>
              <Plus className="size-4" aria-hidden />
              Nuevo turno
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Select
          aria-label="Sede"
          className="sm:w-56"
          value={branchId}
          onChange={(event) => {
            setBranchChoice(event.target.value)
            setProfessionalId('')
          }}
        >
          {myBranches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </Select>
        {canManage && (
          <Select
            aria-label="Profesional"
            className="sm:w-64"
            value={professionalId}
            onChange={(event) => setProfessionalId(event.target.value)}
          >
            <option value="">Todos los profesionales</option>
            {professionalOptions.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.displayName}
              </option>
            ))}
          </Select>
        )}
      </div>

      {myBranches.length === 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          No tenés sedes asignadas. Pedile a un administrador que te asigne una.
        </p>
      )}
      {appointments.isError && <FormError error={appointments.error} className="mb-4" />}

      <div className="overflow-x-auto rounded-lg border bg-card p-2 shadow-sm sm:p-4">
        <FullCalendar
          key={compact ? 'lista' : 'grilla'}
          plugins={[timeGridPlugin, listPlugin, interactionPlugin]}
          locale={esLocale}
          initialView={compact ? 'listWeek' : 'timeGridWeek'}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: compact ? 'listWeek,timeGridDay' : 'timeGridWeek,timeGridDay,listWeek',
          }}
          buttonText={{ today: 'Hoy', week: 'Semana', day: 'Día', list: 'Lista' }}
          firstDay={1}
          allDaySlot={false}
          nowIndicator
          height="auto"
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          snapDuration="00:15:00"
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          selectable={canManage}
          selectMirror
          select={onSelect}
          eventClick={onEventClick}
          datesSet={onDatesSet}
          events={events}
          eventContent={(arg) => {
            const appointment = arg.event.extendedProps['appointment'] as Appointment
            return (
              <div className="overflow-hidden px-1 py-0.5 text-xs leading-tight">
                <p className="truncate font-semibold">
                  {formatTime(appointment.startsAt)} {appointment.patient.fullName}
                </p>
                <p className="truncate opacity-90">
                  {[appointment.practice?.name, professionalId ? null : appointment.professional.displayName]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            )
          }}
        />
      </div>

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
        branches={myBranches}
        professionals={professionals.data ?? []}
        practices={practices.data ?? []}
      />
    </>
  )
}
