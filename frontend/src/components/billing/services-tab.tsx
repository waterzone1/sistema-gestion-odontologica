'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PriceField } from '@/components/billing/price-field'
import { ReasonDialog } from '@/components/billing/reason-dialog'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/input'
import { useAdjustPrice, useRecordService, useServices, useVoid } from '@/hooks/use-billing'
import { usePractices, useProfessionals } from '@/hooks/use-catalog'
import type { PerformedService } from '@/lib/api'
import { isValidAmount, normalizeAmount } from '@/lib/billing'
import { formatDateTime, formatMoney } from '@/lib/format'

interface Props {
  patientId: string
  canRecord: boolean
  canPrice: boolean
  archived: boolean
}

export function ServicesTab({ patientId, canRecord, canPrice, archived }: Props) {
  const services = useServices(patientId)
  const [recording, setRecording] = useState(false)
  const [adjusting, setAdjusting] = useState<PerformedService | null>(null)
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
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {service.practice.name}
                    {service.price && ` · ${formatMoney(service.price)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(service.performedAt)} · {service.professional.displayName}
                  </p>
                  {service.price && service.catalogPrice && service.price !== service.catalogPrice && (
                    <p className="text-xs text-muted-foreground">Precio de catálogo: {formatMoney(service.catalogPrice)}</p>
                  )}
                  {service.status === 'VOIDED' && (
                    <p className="text-xs text-muted-foreground">Motivo de la anulación: {service.voidReason}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {service.status === 'VOIDED' ? (
                    <Badge variant="destructive">Anulada</Badge>
                  ) : (
                    <>
                      {service.pending && (
                        <Badge variant={Number(service.pending) === 0 ? 'success' : 'default'}>
                          {Number(service.pending) === 0 ? 'Saldada' : `Pendiente ${formatMoney(service.pending)}`}
                        </Badge>
                      )}
                      {canPrice && (
                        <Button variant="outline" size="sm" onClick={() => setAdjusting(service)}>
                          Ajustar precio
                        </Button>
                      )}
                      {service.voidable && (
                        <Button variant="outline" size="sm" onClick={() => setVoiding(service)}>
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

      <RecordServiceDialog patientId={patientId} canPrice={canPrice} open={recording} onOpenChange={setRecording} />
      <AdjustPriceDialog
        key={adjusting?.id}
        patientId={patientId}
        service={adjusting}
        onOpenChange={(open) => !open && setAdjusting(null)}
      />
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
  canPrice,
  open,
  onOpenChange,
}: {
  patientId: string
  canPrice: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          title="Registrar prestación"
          description={canPrice ? 'El precio se propone desde el catálogo y se puede ajustar.' : 'Elegí la práctica que realizaste.'}
        >
          <RecordServiceForm patientId={patientId} canPrice={canPrice} onClose={() => onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function RecordServiceForm({ patientId, canPrice, onClose }: { patientId: string; canPrice: boolean; onClose: () => void }) {
  const practices = usePractices('active')
  const professionals = useProfessionals(canPrice)
  const record = useRecordService(patientId)
  const [practiceId, setPracticeId] = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [price, setPrice] = useState('')

  const practice = practices.data?.find((p) => p.id === practiceId)
  const valid = practiceId !== '' && (!canPrice || (professionalId !== '' && isValidAmount(price)))

  return (
    <div className="space-y-4">
      <Field label="Práctica realizada" htmlFor="service-practice">
        <Select
          id="service-practice"
          value={practiceId}
          onChange={(event) => {
            setPracticeId(event.target.value)
            const selected = practices.data?.find((p) => p.id === event.target.value)
            setPrice(selected ? selected.basePrice : '')
          }}
        >
          <option value="">Elegí una práctica</option>
          {(practices.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      {canPrice && (
        <Field label="Profesional que la realizó" htmlFor="service-professional">
          <Select id="service-professional" value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}>
            <option value="">Elegí un profesional</option>
            {(professionals.data ?? [])
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
          </Select>
        </Field>
      )}
      {canPrice && practice && (
        <PriceField id="service-price" value={price} onChange={setPrice} catalogPrice={practice.basePrice} />
      )}
      <FormError error={record.error} />
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={record.isPending}>
          Cancelar
        </Button>
        <Button
          disabled={!valid || record.isPending}
          onClick={() =>
            record.mutate(
              canPrice ? { practiceId, professionalId, price: normalizeAmount(price) } : { practiceId },
              { onSuccess: onClose },
            )
          }
        >
          Registrar
        </Button>
      </DialogFooter>
    </div>
  )
}

function AdjustPriceDialog({
  patientId,
  service,
  onOpenChange,
}: {
  patientId: string
  service: PerformedService | null
  onOpenChange: (open: boolean) => void
}) {
  const adjust = useAdjustPrice(patientId)
  const [price, setPrice] = useState(service?.price ?? '')

  return (
    <Dialog open={service !== null} onOpenChange={onOpenChange}>
      {service && (
        <DialogContent
          title="Ajustar precio"
          description={`${service.practice.name}. No puede quedar por debajo de lo ya pagado${service.paid ? ` (${formatMoney(service.paid)})` : ''}.`}
        >
          <PriceField
            id="adjust-price"
            value={price}
            onChange={setPrice}
            catalogPrice={service.catalogPrice ?? service.price ?? '0'}
          />
          <FormError error={adjust.error} className="mt-3" />
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={adjust.isPending}>
              Cancelar
            </Button>
            <Button
              disabled={!isValidAmount(price) || adjust.isPending}
              onClick={() =>
                adjust.mutate(
                  { id: service.id, price: normalizeAmount(price) },
                  { onSuccess: () => onOpenChange(false) },
                )
              }
            >
              Guardar precio
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
