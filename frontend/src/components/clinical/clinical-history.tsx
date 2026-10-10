'use client'

import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Select, Textarea } from '@/components/ui/input'
import { useAppointments } from '@/hooks/use-appointments'
import { useAddClinicalEntry, useClinicalEntries } from '@/hooks/use-clinical'
import type { Appointment, ClinicalEntry } from '@/lib/api'
import { dayRange } from '@/lib/appointments'
import { formatDateTime, formatTime } from '@/lib/format'

interface Props {
  patientId: string
  userId: string
  canWrite: boolean
  archived: boolean
}

export function ClinicalHistory({ patientId, userId, canWrite, archived }: Props) {
  const entries = useClinicalEntries(patientId)
  const [today] = useState(() => dayRange(new Date()))
  const appointments = useAppointments({ ...today, patientId }, canWrite)
  const ownToday = (appointments.data ?? []).filter(
    (a) => a.professional.userId === userId && a.status !== 'CANCELLED' && a.status !== 'NO_SHOW',
  )
  const [correcting, setCorrecting] = useState<string | null>(null)

  if (entries.isPending) return <LoadingBlock />
  if (entries.isError) return <FormError error={entries.error} />

  const corrections = new Map<string, ClinicalEntry[]>()
  for (const entry of entries.data) {
    if (entry.correctionOfId) {
      corrections.set(entry.correctionOfId, [...(corrections.get(entry.correctionOfId) ?? []), entry])
    }
  }
  const notes = entries.data.filter((entry) => !entry.correctionOfId)
  const writable = canWrite && !archived

  return (
    <div className="space-y-6">
      {writable && (
        <EntryForm
          key={ownToday.map((a) => a.id).join()}
          patientId={patientId}
          appointments={ownToday}
          label="Nueva nota de evolución"
          submitLabel="Guardar nota"
        />
      )}
      {canWrite && archived && (
        <p className="text-sm text-muted-foreground">El paciente está archivado: reactivalo para registrar notas.</p>
      )}

      <section aria-label="Notas clínicas">
        <h2 className="mb-2 text-sm font-semibold">Notas clínicas</h2>
        {notes.length === 0 ? (
          <EmptyState title="Todavía no hay notas clínicas" />
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg border bg-card p-4 shadow-sm">
                <Entry entry={note} />
                {(corrections.get(note.id) ?? [])
                  .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                  .map((correction) => (
                    <div key={correction.id} className="mt-3 border-l-2 border-primary/40 pl-3">
                      <Entry entry={correction} />
                    </div>
                  ))}
                {writable &&
                  (correcting === note.id ? (
                    <div className="mt-3">
                      <EntryForm
                        patientId={patientId}
                        correctionOfId={note.id}
                        label="Corrección"
                        submitLabel="Guardar corrección"
                        onDone={() => setCorrecting(null)}
                        onCancel={() => setCorrecting(null)}
                      />
                    </div>
                  ) : (
                    <Button variant="secondary" className="mt-2" onClick={() => setCorrecting(note.id)}>
                      Agregar corrección
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Entry({ entry }: { entry: ClinicalEntry }) {
  return (
    <article>
      <header className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{entry.professional.displayName}</span>
        <span>{formatDateTime(entry.createdAt)}</span>
        {entry.entryType === 'CORRECTION' && <Badge variant="muted">Corrección</Badge>}
      </header>
      <p className="whitespace-pre-wrap text-sm">{entry.content}</p>
    </article>
  )
}

function EntryForm({
  patientId,
  appointments = [],
  correctionOfId,
  label,
  submitLabel,
  onDone,
  onCancel,
}: {
  patientId: string
  appointments?: Appointment[]
  correctionOfId?: string
  label: string
  submitLabel: string
  onDone?: () => void
  onCancel?: () => void
}) {
  const [content, setContent] = useState('')
  const [appointmentId, setAppointmentId] = useState(appointments[0]?.id ?? '')
  const add = useAddClinicalEntry(patientId, correctionOfId)
  const id = `entry-${correctionOfId ?? 'new'}`

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    add.mutate({ content, ...(appointmentId ? { appointmentId } : {}) }, {
      onSuccess: () => {
        setContent('')
        onDone?.()
      },
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <Field label={label} htmlFor={id} hint="Una vez guardada, la nota no se puede editar ni borrar.">
        <Textarea id={id} value={content} onChange={(event) => setContent(event.target.value)} maxLength={10000} />
      </Field>
      {appointments.length > 0 && (
        <Field label="Turno" htmlFor={`${id}-appointment`}>
          <Select id={`${id}-appointment`} value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)}>
            {appointments.map((appointment) => (
              <option key={appointment.id} value={appointment.id}>
                Turno de hoy {formatTime(appointment.startsAt)}
                {appointment.practice ? ` · ${appointment.practice.name}` : ''}
              </option>
            ))}
            <option value="">Sin turno</option>
          </Select>
        </Field>
      )}
      <FormError error={add.error} />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={add.isPending || content.trim().length < 3}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
