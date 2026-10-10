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
import { Input, Select } from '@/components/ui/input'
import { useRecordService } from '@/hooks/use-billing'
import { usePractices } from '@/hooks/use-catalog'
import { useAddItem, useCreatePlan, useItemAction, useTreatmentPlans } from '@/hooks/use-treatment'
import type { TreatmentPlan } from '@/lib/api'
import { isValidAmount, normalizeAmount } from '@/lib/billing'
import { formatDate, formatMoney } from '@/lib/format'
import { SURFACE_LABELS, type Surface } from '@/lib/odontogram'
import { isOpenItem, ITEM_STATUS_LABELS, itemLocation, PLAN_STATUS_LABELS, TOOTH_OPTIONS } from '@/lib/treatment'

type Item = TreatmentPlan['items'][number]

interface Props {
  patientId: string
  canPlan: boolean
  canPrice: boolean
  canCancel: boolean
  canPerform: boolean
  archived: boolean
}

export function TreatmentTab({ patientId, canPlan, canPrice, canCancel, canPerform, archived }: Props) {
  const plans = useTreatmentPlans(patientId)
  const createPlan = useCreatePlan(patientId)
  const action = useItemAction(patientId)
  const perform = useRecordService(patientId)
  const [adding, setAdding] = useState<string | null>(null)
  const [pricing, setPricing] = useState<{ planId: string; item: Item } | null>(null)
  const [cancelling, setCancelling] = useState<{ planId: string; item: Item } | null>(null)
  const [title, setTitle] = useState('')

  if (plans.isPending) return <LoadingBlock />
  if (plans.isError) return <FormError error={plans.error} />

  return (
    <div className="space-y-4">
      {canPlan && !archived && (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            createPlan.mutate(title.trim(), { onSuccess: () => setTitle('') })
          }}
        >
          <Field label="Nuevo plan de tratamiento" htmlFor="plan-title" className="flex-1">
            <Input id="plan-title" placeholder="Título (opcional), por ejemplo: Rehabilitación" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Button type="submit" disabled={createPlan.isPending}>
            <Plus className="size-4" aria-hidden />
            Crear plan
          </Button>
        </form>
      )}
      <FormError error={createPlan.error ?? action.error ?? perform.error} />

      {plans.data.length === 0 ? (
        <EmptyState title="Todavía no hay planes de tratamiento" />
      ) : (
        plans.data.map((plan) => (
          <section key={plan.id} aria-label={plan.title ?? 'Plan de tratamiento'} className="rounded-lg border bg-card shadow-sm">
            <header className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold">{plan.title ?? 'Plan de tratamiento'}</h3>
                <p className="text-xs text-muted-foreground">
                  {plan.professional.displayName} · {formatDate(plan.createdAt)}
                  {plan.acceptedAt && ` · aceptado el ${formatDate(plan.acceptedAt)}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={plan.status === 'ACCEPTED' ? 'success' : plan.status === 'DRAFT' ? 'default' : 'muted'}>
                  {PLAN_STATUS_LABELS[plan.status]}
                </Badge>
                {plan.total !== null && <span className="text-sm font-semibold">Total {formatMoney(plan.total)}</span>}
              </div>
            </header>
            {plan.items.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Todavía no tiene prácticas.</p>
            ) : (
              <ul className="divide-y">
                {plan.items.map((item) => (
                  <li key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">
                        {item.practice.name}
                        {itemLocation(item) && <span className="font-normal text-muted-foreground"> · {itemLocation(item)}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ITEM_STATUS_LABELS[item.status]}
                        {canPrice &&
                          (item.agreedPrice ? ` · Acordado ${formatMoney(item.agreedPrice)}` : ' · Sin cotizar')}
                        {item.notes && ` · ${item.notes}`}
                        {item.cancelReason && ` · Motivo: ${item.cancelReason}`}
                      </p>
                    </div>
                    {isOpenItem(item) && !archived && (
                      <div className="flex flex-wrap gap-2">
                        {canPrice && (
                          <Button variant="outline" size="sm" onClick={() => setPricing({ planId: plan.id, item })}>
                            {item.priced ? 'Cambiar precio' : 'Cotizar'}
                          </Button>
                        )}
                        {canPlan && item.status === 'PLANNED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={action.isPending}
                            onClick={() => action.mutate({ kind: 'start', planId: plan.id, itemId: item.id })}
                          >
                            Iniciar
                          </Button>
                        )}
                        {canPerform && (
                          <Button
                            size="sm"
                            disabled={perform.isPending}
                            onClick={() => perform.mutate({ treatmentItemId: item.id })}
                          >
                            Registrar realizado
                          </Button>
                        )}
                        {canCancel && (
                          <Button variant="outline" size="sm" onClick={() => setCancelling({ planId: plan.id, item })}>
                            Cancelar
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!archived && (plan.status === 'DRAFT' || plan.status === 'ACCEPTED') && (
              <footer className="flex flex-wrap justify-end gap-2 border-t px-4 py-3">
                {canPlan && (
                  <Button variant="outline" size="sm" onClick={() => setAdding(plan.id)}>
                    <Plus className="size-4" aria-hidden />
                    Agregar práctica
                  </Button>
                )}
                {canPrice && plan.status === 'DRAFT' && (
                  <Button
                    size="sm"
                    disabled={action.isPending || plan.items.every((i) => i.status === 'CANCELLED')}
                    onClick={() => action.mutate({ kind: 'accept', planId: plan.id })}
                  >
                    Registrar aceptación del presupuesto
                  </Button>
                )}
              </footer>
            )}
          </section>
        ))
      )}

      <Dialog open={adding !== null} onOpenChange={(open) => !open && setAdding(null)}>
        {adding && (
          <DialogContent title="Agregar práctica al plan" description="La pieza y las superficies son opcionales.">
            <AddItemForm patientId={patientId} planId={adding} onDone={() => setAdding(null)} />
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={pricing !== null} onOpenChange={(open) => !open && setPricing(null)}>
        {pricing && (
          <DialogContent title="Precio acordado" description={pricing.item.practice.name}>
            <PriceForm
              key={pricing.item.id}
              item={pricing.item}
              pending={action.isPending}
              onSave={(price) =>
                action.mutate(
                  { kind: 'price', planId: pricing.planId, itemId: pricing.item.id, price },
                  { onSuccess: () => setPricing(null) },
                )
              }
              onCancel={() => setPricing(null)}
            />
          </DialogContent>
        )}
      </Dialog>
      <ReasonDialog
        key={cancelling?.item.id}
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancelar práctica del plan"
        description="Queda registrada como cancelada, con el motivo."
        confirmLabel="Cancelar práctica"
        pending={action.isPending}
        error={action.error}
        onConfirm={(reason) =>
          cancelling &&
          action.mutate(
            { kind: 'cancel', planId: cancelling.planId, itemId: cancelling.item.id, reason },
            { onSuccess: () => setCancelling(null) },
          )
        }
      />
    </div>
  )
}

function PriceForm({
  item,
  pending,
  onSave,
  onCancel,
}: {
  item: Item
  pending: boolean
  onSave: (price: string) => void
  onCancel: () => void
}) {
  const [price, setPrice] = useState(item.agreedPrice ?? item.catalogPrice ?? '')
  return (
    <div className="space-y-4">
      <PriceField id="agreed-price" value={price} onChange={setPrice} catalogPrice={item.catalogPrice ?? '0'} />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button disabled={!isValidAmount(price) || pending} onClick={() => onSave(normalizeAmount(price))}>
          Guardar precio
        </Button>
      </DialogFooter>
    </div>
  )
}

function AddItemForm({ patientId, planId, onDone }: { patientId: string; planId: string; onDone: () => void }) {
  const practices = usePractices('active')
  const add = useAddItem(patientId)
  const [practiceId, setPracticeId] = useState('')
  const [tooth, setTooth] = useState('')
  const [surfaces, setSurfaces] = useState<Surface[]>([])
  const [notes, setNotes] = useState('')

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        add.mutate(
          { planId, practiceId, ...(tooth ? { tooth: Number(tooth) } : {}), surfaces: tooth ? surfaces : [], notes },
          { onSuccess: onDone },
        )
      }}
    >
      <Field label="Práctica" htmlFor="item-practice">
        <Select id="item-practice" value={practiceId} onChange={(e) => setPracticeId(e.target.value)}>
          <option value="">Elegí una práctica</option>
          {(practices.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Pieza (opcional)" htmlFor="item-tooth">
        <Select id="item-tooth" value={tooth} onChange={(e) => setTooth(e.target.value)}>
          <option value="">Sin pieza</option>
          {TOOTH_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>
      {tooth && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Superficies (opcional)</legend>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SURFACE_LABELS) as Surface[]).map((surface) => {
              const active = surfaces.includes(surface)
              return (
                <Button
                  key={surface}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  aria-pressed={active}
                  title={SURFACE_LABELS[surface]}
                  onClick={() => setSurfaces((c) => (active ? c.filter((s) => s !== surface) : [...c, surface]))}
                >
                  {surface}
                </Button>
              )
            })}
          </div>
        </fieldset>
      )}
      <Field label="Notas clínicas (opcional)" htmlFor="item-notes">
        <Input id="item-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <FormError error={add.error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={add.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!practiceId || add.isPending}>
          Agregar
        </Button>
      </DialogFooter>
    </form>
  )
}
