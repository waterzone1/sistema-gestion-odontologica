'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { ReasonDialog } from '@/components/billing/reason-dialog'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/input'
import { useRecordService, useServices, useVoid } from '@/hooks/use-billing'
import { usePractices } from '@/hooks/use-catalog'
import type { PerformedService } from '@/lib/api'
import { formatDateTime, formatMoney } from '@/lib/format'

interface Props {
  patientId: string
  canRecord: boolean
  canVoid: boolean
  archived: boolean
}

export function ServicesTab({ patientId, canRecord, canVoid, archived }: Props) {
  const services = useServices(patientId)
  const [recording, setRecording] = useState(false)
  const [voiding, setVoiding] = useState<PerformedService | null>(null)
  const voidService = useVoid(patientId, 'services')

  if (services.isPending) return <LoadingBlock />
  if (services.isError) return <FormError error={services.error} />

  return (
    <div className="space-y-4">
      {canRecord && !archived && (
        <div className="flex justify-end">
          <Button onClick={() => setRecording(true)}>
            <Plus className="size-4" aria-hidden />
            Registrar prestación
          </Button>
        </div>
      )}

      <section aria-label="Prestaciones realizadas">
        {services.data.length === 0 ? (
          <EmptyState title="Todavía no tiene prestaciones registradas" />
        ) : (
          <ul className="divide-y rounded-lg border bg-card shadow-sm">
            {services.data.map((service) => (
              <li key={service.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <p className="font-medium">
                    {service.practice.name} · {formatMoney(service.price)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(service.performedAt)} · {service.professional.displayName}
                  </p>
                  {service.status === 'VOIDED' && (
                    <p className="text-xs text-muted-foreground">Motivo de la anulación: {service.voidReason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {service.status === 'VOIDED' ? (
                    <Badge variant="destructive">Anulada</Badge>
                  ) : (
                    <>
                      <Badge variant={Number(service.pending) === 0 ? 'success' : 'default'}>
                        {Number(service.pending) === 0 ? 'Saldada' : `Pendiente ${formatMoney(service.pending)}`}
                      </Badge>
                      {canVoid && (
                        <Button variant="outline" onClick={() => setVoiding(service)}>
                          Anular
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RecordServiceDialog patientId={patientId} open={recording} onOpenChange={setRecording} />
      <ReasonDialog
        key={voiding?.id}
        open={voiding !== null}
        onOpenChange={(open) => !open && setVoiding(null)}
        title="Anular prestación"
        description="La prestación se conserva marcada como anulada y deja de contar en el saldo."
        confirmLabel="Anular prestación"
        pending={voidService.isPending}
        error={voidService.error}
        onConfirm={(reason) =>
          voiding && voidService.mutate({ id: voiding.id, reason }, { onSuccess: () => setVoiding(null) })
        }
      />
    </div>
  )
}

function RecordServiceDialog({
  patientId,
  open,
  onOpenChange,
}: {
  patientId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const practices = usePractices('active', open)
  const record = useRecordService(patientId)
  const [practiceId, setPracticeId] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Registrar prestación" description="El precio se toma del catálogo y queda fijo.">
        <Field label="Práctica realizada" htmlFor="service-practice">
          <Select id="service-practice" value={practiceId} onChange={(event) => setPracticeId(event.target.value)}>
            <option value="">Elegí una práctica</option>
            {(practices.data ?? []).map((practice) => (
              <option key={practice.id} value={practice.id}>
                {practice.name} — {formatMoney(practice.basePrice)}
              </option>
            ))}
          </Select>
        </Field>
        <FormError error={record.error} className="mt-3" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={record.isPending}>
            Cancelar
          </Button>
          <Button
            disabled={!practiceId || record.isPending}
            onClick={() =>
              record.mutate(practiceId, {
                onSuccess: () => {
                  setPracticeId('')
                  onOpenChange(false)
                },
              })
            }
          >
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
