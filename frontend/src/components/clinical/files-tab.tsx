'use client'

import { FileText, ImageIcon, Upload } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock } from '@/components/page-header'
import { Pagination, usePagedList } from '@/components/pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { useArchiveClinicalFile, useClinicalFiles, useUploadClinicalFile } from '@/hooks/use-clinical'
import type { ClinicalFile } from '@/lib/api'
import { FILE_CATEGORY_LABELS, fileProblem, formatBytes } from '@/lib/files'
import { formatDateTime } from '@/lib/format'

interface Props {
  patientId: string
  canWrite: boolean
  archivedPatient: boolean
}

export function FilesTab({ patientId, canWrite, archivedPatient }: Props) {
  const [showArchived, setShowArchived] = useState(false)
  const files = useClinicalFiles(patientId, showArchived)
  const archive = useArchiveClinicalFile(patientId)
  const [uploading, setUploading] = useState(false)
  const [archiving, setArchiving] = useState<ClinicalFile | null>(null)
  const paged = usePagedList(files.data ?? [])

  if (files.isPending) return <LoadingBlock />
  if (files.isError) return <FormError error={files.error} />

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Mostrar archivados
        </label>
        {canWrite && !archivedPatient && (
          <Button onClick={() => setUploading(true)} className="self-end sm:self-auto">
            <Upload className="size-4" aria-hidden />
            Subir archivo
          </Button>
        )}
      </div>

      <section aria-label="Archivos clínicos">
        {files.data.length === 0 ? (
          <EmptyState title="Todavía no hay archivos" description="Radiografías, estudios, fotos o consentimientos en PDF, JPG o PNG." />
        ) : (
          <ul className="divide-y rounded-lg border bg-card shadow-sm">
            {paged.items.map((file) => {
              const Icon = file.mimeType === 'application/pdf' ? FileText : ImageIcon
              return (
                <li key={file.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3 text-sm">
                    <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      <a
                        href={`/api/patients/${patientId}/files/${file.id}/content`}
                        target="_blank"
                        rel="noopener"
                        className="block truncate font-medium text-primary hover:underline"
                      >
                        {file.filename}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {FILE_CATEGORY_LABELS[file.category]} · {formatBytes(file.size)} · {formatDateTime(file.createdAt)} ·{' '}
                        {file.professional.displayName}
                      </p>
                      {file.description && <p className="text-xs text-muted-foreground">{file.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {file.archived ? (
                      <Badge variant="muted">Archivado</Badge>
                    ) : (
                      canWrite && (
                        <Button variant="outline" size="sm" onClick={() => setArchiving(file)}>
                          Archivar
                        </Button>
                      )
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {paged.totalPages > 1 && (
          <Pagination
            label="Paginación de archivos"
            page={paged.page}
            totalPages={paged.totalPages}
            summary={`${files.data.length} archivos`}
            onChange={paged.setPage}
          />
        )}
      </section>

      <Dialog open={uploading} onOpenChange={setUploading}>
        {uploading && (
          <DialogContent title="Subir archivo clínico" description="PDF, JPG o PNG. Queda guardado de forma privada, a tu nombre.">
            <UploadForm patientId={patientId} onDone={() => setUploading(false)} />
          </DialogContent>
        )}
      </Dialog>
      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title="Archivar archivo"
        description="Deja de aparecer en el listado habitual, pero no se borra y se puede seguir consultando."
        confirmLabel="Archivar"
        pending={archive.isPending}
        error={archive.error ? 'No se pudo archivar' : undefined}
        onConfirm={() => archiving && archive.mutate(archiving.id, { onSuccess: () => setArchiving(null) })}
      />
    </div>
  )
}

function UploadForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const upload = useUploadClinicalFile(patientId)
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState<ClinicalFile['category']>('XRAY')
  const [description, setDescription] = useState('')
  const problem = file ? fileProblem(file) : null

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (file) upload.mutate({ file, category, description }, { onSuccess: onDone })
      }}
    >
      <Field label="Archivo" htmlFor="file-input" error={problem ?? undefined}>
        <Input
          id="file-input"
          type="file"
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </Field>
      <Field label="Categoría" htmlFor="file-category">
        <Select id="file-category" value={category} onChange={(e) => setCategory(e.target.value as ClinicalFile['category'])}>
          {Object.entries(FILE_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Descripción (opcional)" htmlFor="file-description">
        <Input id="file-description" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <FormError error={upload.error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={upload.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!file || !!problem || upload.isPending}>
          {upload.isPending ? 'Subiendo…' : 'Subir'}
        </Button>
      </DialogFooter>
    </form>
  )
}
