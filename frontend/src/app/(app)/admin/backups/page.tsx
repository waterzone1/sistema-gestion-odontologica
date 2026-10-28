'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DatabaseBackup, Download } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Figure } from '@/components/billing/figure'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock, PageHeader } from '@/components/page-header'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useSession } from '@/hooks/use-session'
import { api, type BackupRecord, type BackupStatus, type RestoreResult } from '@/lib/api'
import { formatBytes } from '@/lib/files'
import { formatDateTime } from '@/lib/format'
import { can } from '@/lib/permissions'

const STATUS_LABELS: Record<BackupRecord['status'], string> = { RUNNING: 'En curso', SUCCEEDED: 'Completo', FAILED: 'Falló' }
const KIND_LABELS: Record<BackupRecord['kind'], string> = { SCHEDULED: 'Automático', MANUAL: 'Manual' }

const size = (bytes: number | null) => (bytes === null ? '—' : formatBytes(bytes))

export default function BackupsPage() {
  const router = useRouter()
  const client = useQueryClient()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'backups:manage')
  const [restoring, setRestoring] = useState<BackupRecord | null>(null)
  const [restored, setRestored] = useState<RestoreResult | null>(null)

  const status = useQuery({
    queryKey: ['backups', 'status'],
    queryFn: () => api.get<BackupStatus>('/api/backups/status'),
    enabled: allowed,
    refetchInterval: (query) => (query.state.data?.running ? 2000 : false),
  })
  const backups = useQuery({
    queryKey: ['backups', 'list'],
    queryFn: () => api.get<BackupRecord[]>('/api/backups'),
    enabled: allowed,
    refetchInterval: (query) => (query.state.data?.some((b) => b.status === 'RUNNING') ? 2000 : false),
  })
  const start = useMutation({
    mutationFn: () => api.post<BackupRecord>('/api/backups'),
    onSuccess: () => client.invalidateQueries({ queryKey: ['backups'] }),
  })

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  if (!user || !allowed || status.isPending || backups.isPending) return <LoadingBlock />

  const running = status.data?.running ?? null

  return (
    <>
      <PageHeader
        title="Backups"
        description="Copia completa de la base y de los archivos clínicos, con un manifest y su checksum. Se hace uno automático por día; se conservan 7 diarios, 4 semanales y los últimos 10 manuales."
        actions={
          <Button disabled={running !== null || start.isPending || status.data?.toolsAvailable === false} onClick={() => start.mutate()}>
            <DatabaseBackup className="size-4" aria-hidden />
            Generar backup ahora
          </Button>
        }
      />
      {status.data?.toolsAvailable === false && (
        <Alert variant="info" className="mb-4">
          Este servidor no tiene las herramientas de PostgreSQL instaladas: los backups funcionan en la instalación con Docker.
        </Alert>
      )}
      {restored && (
        <Alert variant="info" className="mb-4">
          Restauración terminada y verificada el {formatDateTime(restored.restoredAt)}: {restored.counts.patients} pacientes,{' '}
          {restored.counts.appointments} turnos, {restored.counts.clinicalEntries} notas clínicas, {restored.counts.clinicalFiles} archivos.
        </Alert>
      )}
      <FormError error={start.error ?? status.error ?? backups.error} className="mb-4" />
      <section aria-label="Estado" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Figure label="Último backup completo" value={status.data?.lastSuccess ? formatDateTime(status.data.lastSuccess) : 'Ninguno'} />
        <Figure label="Próximo automático" value={status.data?.nextScheduled ? formatDateTime(status.data.nextScheduled) : 'Sin programar'} />
        <Figure label="Estado" value={running ? 'Generando…' : 'Sin tareas en curso'} />
      </section>

      {backups.data && backups.data.length === 0 ? (
        <EmptyState title="Todavía no hay backups" />
      ) : (
        <ul className="divide-y rounded-lg border bg-card shadow-sm" data-tour="backups-list">
          {(backups.data ?? []).map((backup) => (
            <li key={backup.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">
                  {formatDateTime(backup.startedAt)} · {KIND_LABELS[backup.kind]}
                  {backup.createdBy && <span className="font-normal text-muted-foreground"> · {backup.createdBy}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {size(backup.size)}
                  {backup.counts &&
                    ` · ${backup.counts.patients} pacientes, ${backup.counts.appointments} turnos, ${backup.counts.clinicalFiles} archivos`}
                  {backup.sha256 && ` · SHA-256 ${backup.sha256.slice(0, 12)}…`}
                </p>
                {backup.error && <p className="text-xs text-destructive">{backup.error}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={backup.status === 'SUCCEEDED' ? 'success' : backup.status === 'FAILED' ? 'destructive' : 'default'}>
                  {STATUS_LABELS[backup.status]}
                </Badge>
                {backup.status === 'SUCCEEDED' && (
                  <>
                    <a href={`/api/backups/${backup.id}/download`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                      <Download className="size-4" aria-hidden />
                      Descargar
                    </a>
                    <Button variant="outline" size="sm" disabled={running !== null} onClick={() => setRestoring(backup)}>
                      Restaurar
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={restoring !== null} onOpenChange={(open) => !open && setRestoring(null)}>
        {restoring && (
          <DialogContent title="Restaurar backup" description={`Del ${formatDateTime(restoring.startedAt)}`}>
            <RestoreForm
              backup={restoring}
              onDone={(result) => {
                setRestoring(null)
                setRestored(result)
                void client.invalidateQueries()
              }}
              onCancel={() => setRestoring(null)}
            />
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}

function RestoreForm({ backup, onDone, onCancel }: { backup: BackupRecord; onDone: (result: RestoreResult) => void; onCancel: () => void }) {
  const [confirmation, setConfirmation] = useState('')
  const restore = useMutation({
    mutationFn: () => api.post<RestoreResult>(`/api/backups/${backup.id}/restore`, { confirmation }),
    onSuccess: onDone,
  })
  return (
    <div className="space-y-4">
      <Alert variant="info" title="Esto reemplaza todos los datos actuales">
        La base y los archivos clínicos vuelven a como estaban al momento del backup. Lo cargado después se pierde. Mientras se
        restaura, el sistema queda en mantenimiento para todos los usuarios.
      </Alert>
      <Field label="Escribí RESTAURAR para confirmar" htmlFor="restore-confirmation">
        <Input id="restore-confirmation" autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
      </Field>
      <FormError error={restore.error} />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={restore.isPending}>
          Cancelar
        </Button>
        <Button disabled={confirmation !== 'RESTAURAR' || restore.isPending} onClick={() => restore.mutate()}>
          {restore.isPending ? 'Restaurando…' : 'Restaurar'}
        </Button>
      </DialogFooter>
    </div>
  )
}
