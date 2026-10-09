'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { appointmentsKey } from '@/hooks/use-appointments'
import { patientsKey } from '@/hooks/use-patients'
import { api, ApiError, type Patient } from '@/lib/api'
import { formatDateTime } from '@/lib/format'

interface ActiveAppointment {
  id: string
  startsAt: string
  professional: string
}

interface Props {
  patient: Patient
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ArchivePatientDialog({ patient, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <ArchiveContent patient={patient} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function ArchiveContent({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const client = useQueryClient()
  const archived = patient.archivedAt !== null
  const [pending, setPending] = useState<ActiveAppointment[] | null>(null)
  const [accepted, setAccepted] = useState(false)

  const change = useMutation({
    mutationFn: (cancelActiveAppointments: boolean) =>
      archived
        ? api.post<Patient>(`/api/patients/${patient.id}/unarchive`)
        : api.post<Patient>(`/api/patients/${patient.id}/archive`, { cancelActiveAppointments }),
    onSuccess: async (updated) => {
      client.setQueryData([...patientsKey, 'detail', patient.id], updated)
      await Promise.all([
        client.invalidateQueries({ queryKey: patientsKey }),
        client.invalidateQueries({ queryKey: appointmentsKey }),
      ])
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'ACTIVE_APPOINTMENTS') {
        setPending((error.details as { appointments: ActiveAppointment[] }).appointments)
      }
    },
  })

  const blocked = pending !== null
  const title = archived ? 'Reactivar paciente' : 'Archivar paciente'
  const description = archived
    ? 'Vuelve a aparecer en las búsquedas y se pueden registrar nuevos turnos.'
    : 'Deja de aparecer en las búsquedas habituales. No se borra nada: sus datos y su historial se conservan y se puede reactivar.'

  return (
    <DialogContent title={title} description={description}>
      {blocked ? (
        <div className="space-y-3 text-sm">
          <p className="font-medium">El paciente tiene {pending.length === 1 ? 'un turno pendiente' : `${pending.length} turnos pendientes`}:</p>
          <ul className="divide-y rounded-md border">
            {pending.map((appointment) => (
              <li key={appointment.id} className="px-3 py-2">
                {formatDateTime(appointment.startsAt)} · {appointment.professional}
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span>Entiendo que al archivar se cancelan estos turnos con el motivo «Paciente archivado».</span>
          </label>
        </div>
      ) : (
        <FormError error={change.error} />
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={change.isPending}>
          Cancelar
        </Button>
        <Button
          onClick={() => change.mutate(blocked)}
          disabled={change.isPending || (blocked && !accepted)}
        >
          {change.isPending ? 'Procesando…' : blocked ? 'Archivar y cancelar turnos' : archived ? 'Reactivar' : 'Archivar'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
