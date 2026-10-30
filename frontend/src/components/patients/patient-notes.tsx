'use client'

import { MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Pagination, usePagedList } from '@/components/pagination'
import { useAddPatientNote, useArchivePatientNote, usePatientNotes } from '@/hooks/use-patient-notes'
import type { PatientNote } from '@/lib/api'
import { formatDateTime } from '@/lib/format'

interface Props {
  patientId: string
  canWrite: boolean
}

export function PatientNotes({ patientId, canWrite }: Props) {
  const [showArchived, setShowArchived] = useState(false)
  const notes = usePatientNotes(patientId, showArchived)
  const add = useAddPatientNote(patientId)
  const archive = useArchivePatientNote(patientId)
  const [content, setContent] = useState('')
  const paged = usePagedList(notes.data ?? [], 3)

  return (
    <section aria-label="Mensajes del equipo" data-tour="patient-notes" className="rounded-lg border bg-card p-5 shadow-sm sm:col-span-2">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquare className="size-4" aria-hidden />
          Mensajes del equipo
        </h2>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Mostrar archivados
        </label>
      </div>
      {canWrite && (
        <form
          className="mb-4 space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            add.mutate(content.trim(), { onSuccess: () => setContent('') })
          }}
        >
          <label htmlFor="patient-note" className="sr-only">
            Nuevo mensaje
          </label>
          <Textarea
            id="patient-note"
            rows={2}
            maxLength={1000}
            placeholder="Por ejemplo: avisar que trae los estudios, pidió factura, viene acompañado"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Lo ve todo el equipo, incluida recepción. No escribas datos clínicos acá.
            </p>
            <Button type="submit" size="sm" disabled={!content.trim() || add.isPending}>
              Enviar
            </Button>
          </div>
          <FormError error={add.error} />
        </form>
      )}
      <FormError error={archive.error} />
      {notes.data && notes.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay mensajes.</p>
      )}
      <ul className="space-y-2">
        {paged.items.map((note) => (
          <li key={note.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
            <NoteText note={note} />
            {canWrite && !note.archivedAt && (
              <Button
                variant="outline"
                size="sm"
                disabled={archive.isPending}
                onClick={() => archive.mutate(note.id)}
              >
                Archivar
              </Button>
            )}
          </li>
        ))}
      </ul>
      {paged.totalPages > 1 && (
        <Pagination
          label="Paginación de mensajes"
          page={paged.page}
          totalPages={paged.totalPages}
          summary={`${notes.data?.length ?? 0} mensajes`}
          onChange={paged.setPage}
        />
      )}
    </section>
  )
}

export function PatientNotesInline({ patientId }: { patientId: string }) {
  const notes = usePatientNotes(patientId)
  if (!notes.data || notes.data.length === 0) return null
  return (
    <aside aria-label="Mensajes del equipo" className="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <MessageSquare className="size-3.5" aria-hidden />
        Mensajes del equipo
      </p>
      <ul className="space-y-1.5">
        {notes.data.slice(0, 3).map((note) => (
          <li key={note.id}>
            <NoteText note={note} />
          </li>
        ))}
      </ul>
    </aside>
  )
}

function NoteText({ note }: { note: PatientNote }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="whitespace-pre-wrap break-words">{note.content}</p>
      <p className="text-xs text-muted-foreground">
        {note.author.displayName} · {formatDateTime(note.createdAt)}
        {note.archivedAt && ' · Archivado'}
      </p>
    </div>
  )
}
