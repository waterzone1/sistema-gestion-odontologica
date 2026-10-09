'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { appointmentsKey } from '@/hooks/use-appointments'
import { api, type Appointment, type AppointmentStatus } from '@/lib/api'
import { isEditable, STATUS_LABELS, STATUS_VARIANT } from '@/lib/appointments'
import { formatDateTime, formatTime } from '@/lib/format'

interface Props {
  appointment: Appointment | null
  onOpenChange: (open: boolean) => void
  canManage: boolean
  canAttend: boolean
  onEdit?: (appointment: Appointment) => void
}

export function AppointmentDialog({ appointment, onOpenChange, canManage, canAttend, onEdit }: Props) {
  return (
    <Dialog open={appointment !== null} onOpenChange={onOpenChange}>
      {appointment && (
        <DialogContent title="Turno" description={formatDateTime(appointment.startsAt)}>
          <Detail
            appointment={appointment}
            canManage={canManage}
            canAttend={canAttend}
            onEdit={onEdit}
            onClose={() => onOpenChange(false)}
          />
        </DialogContent>
      )}
    </Dialog>
  )
}

function Detail({
  appointment,
  canManage,
  canAttend,
  onEdit,
  onClose,
}: {
  appointment: Appointment
  canManage: boolean
  canAttend: boolean
  onEdit?: (appointment: Appointment) => void
  onClose: () => void
}) {
  const client = useQueryClient()
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [early, setEarly] = useState<'ATTENDED' | 'NO_SHOW' | null>(null)

  const change = useMutation({
    mutationFn: (body: { status: AppointmentStatus; cancellationReason?: string }) =>
      api.post<Appointment>(`/api/appointments/${appointment.id}/status`, body),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: appointmentsKey })
      onClose()
    },
  })

  const editable = isEditable(appointment)
  const mark = (status: 'ATTENDED' | 'NO_SHOW') => {
    if (new Date(appointment.startsAt).getTime() > Date.now()) setEarly(status)
    else change.mutate({ status })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant={STATUS_VARIANT[appointment.status]}>{STATUS_LABELS[appointment.status]}</Badge>
        <span className="text-sm text-muted-foreground">
          {formatTime(appointment.startsAt)} a {formatTime(appointment.endsAt)}
        </span>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Item label="Paciente">
          <Link href={`/patients/${appointment.patient.id}`} className="font-medium text-primary hover:underline">
            {appointment.patient.fullName}
          </Link>
        </Item>
        <Item label="Profesional">{appointment.professional.displayName}</Item>
        <Item label="Sede">{appointment.branch.name}</Item>
        <Item label="Práctica">{appointment.practice?.name ?? '—'}</Item>
        <Item label="Notas">{appointment.notes ?? '—'}</Item>
        {appointment.cancellationReason && <Item label="Motivo de cancelación">{appointment.cancellationReason}</Item>}
      </dl>

      <FormError error={change.error} />

      {early ? (
        <div role="alert" className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
          <p>
            El turno todavía no empezó (es el {formatDateTime(appointment.startsAt)}). ¿Lo marcás igual como{' '}
            {early === 'ATTENDED' ? 'atendido' : 'ausente'}?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEarly(null)} disabled={change.isPending}>
              Volver
            </Button>
            <Button size="sm" disabled={change.isPending} onClick={() => change.mutate({ status: early })}>
              {early === 'ATTENDED' ? 'Marcar atendido igual' : 'Marcar ausente igual'}
            </Button>
          </div>
        </div>
      ) : cancelling ? (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
          <Field label="Motivo de la cancelación" htmlFor="cancel-reason">
            <Input id="cancel-reason" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCancelling(false)} disabled={change.isPending}>
              Volver
            </Button>
            <Button
              size="sm"
              disabled={change.isPending || reason.trim().length < 3}
              onClick={() => change.mutate({ status: 'CANCELLED', cancellationReason: reason.trim() })}
            >
              Cancelar el turno
            </Button>
          </div>
        </div>
      ) : editable && (canManage || canAttend) ? (
        <div className="grid gap-2 border-t pt-4 sm:grid-cols-2">
          {appointment.status === 'SCHEDULED' && canManage && (
            <Button
              className="w-full sm:col-span-2"
              onClick={() => change.mutate({ status: 'CONFIRMED' })}
              disabled={change.isPending}
            >
              Confirmar
            </Button>
          )}
          {canAttend && (
            <Button variant="outline" className="w-full" onClick={() => mark('ATTENDED')} disabled={change.isPending}>
              Marcar atendido
            </Button>
          )}
          {canAttend && (
            <Button variant="outline" className="w-full" onClick={() => mark('NO_SHOW')} disabled={change.isPending}>
              Marcar ausente
            </Button>
          )}
          {canManage && onEdit && (
            <Button variant="outline" className="w-full" onClick={() => onEdit(appointment)} disabled={change.isPending}>
              Editar o reprogramar
            </Button>
          )}
          {canManage && (
            <Button
              variant="outline"
              className="w-full text-destructive"
              onClick={() => setCancelling(true)}
              disabled={change.isPending}
            >
              Cancelar turno
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}
