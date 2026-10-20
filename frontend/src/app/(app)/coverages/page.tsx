'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, MaskedInput, Select } from '@/components/ui/input'
import { usePractices } from '@/hooks/use-catalog'
import {
  useAgreements,
  useCoverageProviders,
  useSaveAgreement,
  useSavePlan,
  useSaveProvider,
  type AgreementItemInput,
} from '@/hooks/use-coverages'
import { useSession } from '@/hooks/use-session'
import type { Agreement, CoverageKind, CoverageProvider } from '@/lib/api'
import { isValidAmount, normalizeAmount } from '@/lib/billing'
import { formatDate, formatMoney, maskDate, parseDateText, toDateText } from '@/lib/format'
import { can } from '@/lib/permissions'

const KIND_LABELS: Record<CoverageKind, string> = { OBRA_SOCIAL: 'Obra social', PREPAGA: 'Prepaga', OTHER: 'Otra' }

export default function CoveragesPage() {
  const router = useRouter()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'coverages:manage')
  const providers = useCoverageProviders(allowed)
  const saveProvider = useSaveProvider()
  const [creating, setCreating] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<{ id: string; label: string } | null>(null)

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  if (!user || !allowed || providers.isPending) return <LoadingBlock />
  if (providers.isError) return <FormError error={providers.error} />

  return (
    <>
      <PageHeader
        title="Coberturas"
        description="Obras sociales y prepagas, sus planes y los convenios con lo que paga cada uno por práctica."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            Nueva cobertura
          </Button>
        }
      />
      <FormError error={saveProvider.error} className="mb-4" />
      {providers.data.length === 0 ? (
        <EmptyState title="Todavía no hay coberturas" description="Creá la primera con «Nueva cobertura»." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="space-y-3">
            {providers.data.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                selectedPlanId={selectedPlan?.id ?? null}
                onSelectPlan={setSelectedPlan}
                onToggle={() => saveProvider.mutate({ id: provider.id, active: !provider.active })}
              />
            ))}
          </div>
          {selectedPlan ? (
            <AgreementsPanel key={selectedPlan.id} planId={selectedPlan.id} label={selectedPlan.label} />
          ) : (
            <EmptyState title="Elegí un plan" description="Para ver y cargar sus convenios." />
          )}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating && (
          <DialogContent title="Nueva cobertura">
            <ProviderForm onDone={() => setCreating(false)} />
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}

function ProviderForm({ onDone }: { onDone: () => void }) {
  const save = useSaveProvider()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<CoverageKind>('OBRA_SOCIAL')
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate({ name: name.trim(), kind }, { onSuccess: onDone })
      }}
    >
      <Field label="Nombre" htmlFor="provider-name">
        <Input id="provider-name" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Tipo" htmlFor="provider-kind">
        <Select id="provider-kind" value={kind} onChange={(e) => setKind(e.target.value as CoverageKind)}>
          {(Object.keys(KIND_LABELS) as CoverageKind[]).map((value) => (
            <option key={value} value={value}>
              {KIND_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <FormError error={save.error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={name.trim().length < 2 || save.isPending}>
          Crear
        </Button>
      </DialogFooter>
    </form>
  )
}

function ProviderCard({
  provider,
  selectedPlanId,
  onSelectPlan,
  onToggle,
}: {
  provider: CoverageProvider
  selectedPlanId: string | null
  onSelectPlan: (plan: { id: string; label: string }) => void
  onToggle: () => void
}) {
  const savePlan = useSavePlan()
  const [planName, setPlanName] = useState('')
  return (
    <section aria-label={provider.name} className="rounded-lg border bg-card p-4 shadow-sm">
      <header className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{provider.name}</h2>
          <p className="text-xs text-muted-foreground">{KIND_LABELS[provider.kind]}</p>
        </div>
        <div className="flex items-center gap-2">
          {!provider.active && <Badge variant="muted">Inactiva</Badge>}
          <Button variant="outline" size="sm" onClick={onToggle}>
            {provider.active ? 'Desactivar' : 'Reactivar'}
          </Button>
        </div>
      </header>
      <ul className="space-y-1">
        {provider.plans.map((plan) => (
          <li key={plan.id} className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-pressed={selectedPlanId === plan.id}
              onClick={() => onSelectPlan({ id: plan.id, label: `${provider.name} · ${plan.name}` })}
              className={`flex-1 rounded-md px-2 py-1 text-left text-sm hover:bg-muted ${selectedPlanId === plan.id ? 'bg-primary/10 font-medium' : ''}`}
            >
              Plan {plan.name}
              {!plan.active && <span className="text-xs text-muted-foreground"> · inactivo</span>}
            </button>
            <Button
              variant="outline"
              size="sm"
              disabled={savePlan.isPending}
              onClick={() => savePlan.mutate({ planId: plan.id, active: !plan.active })}
            >
              {plan.active ? 'Desactivar' : 'Reactivar'}
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          savePlan.mutate({ providerId: provider.id, name: planName.trim() }, { onSuccess: () => setPlanName('') })
        }}
      >
        <label htmlFor={`plan-${provider.id}`} className="sr-only">
          Nuevo plan de {provider.name}
        </label>
        <Input
          id={`plan-${provider.id}`}
          placeholder="Nuevo plan, por ejemplo 210"
          maxLength={80}
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
        />
        <Button type="submit" variant="outline" size="sm" className="h-9" disabled={planName.trim().length < 2 || savePlan.isPending}>
          Agregar plan
        </Button>
      </form>
      <FormError error={savePlan.error} className="mt-2" />
    </section>
  )
}

function AgreementsPanel({ planId, label }: { planId: string; label: string }) {
  const agreements = useAgreements(planId)
  const [editing, setEditing] = useState<Agreement | 'new' | null>(null)
  return (
    <section aria-label={`Convenios de ${label}`} className="rounded-lg border bg-card p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Convenios de {label}</h2>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden />
          Nuevo convenio
        </Button>
      </header>
      <FormError error={agreements.error} />
      {agreements.data?.length === 0 && <p className="text-sm text-muted-foreground">Este plan todavía no tiene convenios.</p>}
      <ul className="space-y-3">
        {(agreements.data ?? []).map((agreement) => (
          <li key={agreement.id} className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Vigente desde {formatDate(agreement.validFrom)}
                {agreement.validTo ? ` hasta ${formatDate(agreement.validTo)}` : ', sin fecha de fin'}
              </p>
              <Button variant="outline" size="sm" onClick={() => setEditing(agreement)}>
                Editar
              </Button>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1 font-medium">Práctica</th>
                  <th scope="col" className="py-1 font-medium">Cubre</th>
                  <th scope="col" className="py-1 font-medium">Coseguro</th>
                  <th scope="col" className="py-1 font-medium">Autorización</th>
                </tr>
              </thead>
              <tbody>
                {agreement.items.map((item) => (
                  <tr key={item.practice.id}>
                    <td className="py-1">{item.practice.name}</td>
                    <td className="py-1">{formatMoney(item.insurerAmount)}</td>
                    <td className="py-1">{formatMoney(item.patientCopay)}</td>
                    <td className="py-1">{item.requiresAuthorization ? 'Sí' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
      </ul>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <DialogContent title={editing === 'new' ? 'Nuevo convenio' : 'Editar convenio'} className="max-w-2xl">
            <AgreementForm planId={planId} agreement={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </Dialog>
    </section>
  )
}

interface Row extends AgreementItemInput {
  key: number
}

function AgreementForm({ planId, agreement, onDone }: { planId: string; agreement: Agreement | null; onDone: () => void }) {
  const practices = usePractices('active')
  const save = useSaveAgreement(planId)
  const [from, setFrom] = useState(agreement ? formatDate(agreement.validFrom) : toDateText(new Date()))
  const [to, setTo] = useState(agreement?.validTo ? formatDate(agreement.validTo) : '')
  const [rows, setRows] = useState<Row[]>(
    agreement
      ? agreement.items.map((item, key) => ({
          key,
          practiceId: item.practice.id,
          insurerAmount: item.insurerAmount,
          patientCopay: item.patientCopay,
          requiresAuthorization: item.requiresAuthorization,
        }))
      : [{ key: 0, practiceId: '', insurerAmount: '', patientCopay: '0', requiresAuthorization: false }],
  )
  const amount = (value: string) => isValidAmount(value, { allowZero: true })
  const validFrom = parseDateText(from)
  const validTo = to ? parseDateText(to) : null
  const valid =
    validFrom !== null &&
    (to === '' || validTo !== null) &&
    rows.length > 0 &&
    rows.every((r) => r.practiceId && amount(r.insurerAmount) && amount(r.patientCopay)) &&
    new Set(rows.map((r) => r.practiceId)).size === rows.length
  const update = (key: number, patch: Partial<Row>) => setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!validFrom) return
        const items = rows.map((row) => ({
          practiceId: row.practiceId,
          insurerAmount: normalizeAmount(row.insurerAmount),
          patientCopay: normalizeAmount(row.patientCopay),
          requiresAuthorization: row.requiresAuthorization,
        }))
        save.mutate(
          agreement ? { id: agreement.id, validTo, items } : { validFrom, ...(validTo ? { validTo } : {}), items },
          { onSuccess: onDone },
        )
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vigente desde" htmlFor="agreement-from">
          <MaskedInput id="agreement-from" mask={maskDate} placeholder="dd/mm/aaaa" disabled={agreement !== null} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta (opcional)" htmlFor="agreement-to">
          <MaskedInput id="agreement-to" mask={maskDate} placeholder="dd/mm/aaaa" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Prácticas cubiertas</legend>
        {rows.map((row, index) => (
          <div key={row.key} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[2fr_1fr_1fr_auto_auto] sm:items-end">
            <Field label="Práctica" htmlFor={`row-practice-${row.key}`}>
              <Select id={`row-practice-${row.key}`} value={row.practiceId} onChange={(e) => update(row.key, { practiceId: e.target.value })}>
                <option value="">Elegí</option>
                {(practices.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cubre" htmlFor={`row-insurer-${row.key}`}>
              <Input id={`row-insurer-${row.key}`} inputMode="decimal" value={row.insurerAmount} onChange={(e) => update(row.key, { insurerAmount: e.target.value })} />
            </Field>
            <Field label="Coseguro" htmlFor={`row-copay-${row.key}`}>
              <Input id={`row-copay-${row.key}`} inputMode="decimal" value={row.patientCopay} onChange={(e) => update(row.key, { patientCopay: e.target.value })} />
            </Field>
            <label className="flex items-center gap-1.5 pb-2 text-xs">
              <input
                type="checkbox"
                checked={row.requiresAuthorization}
                onChange={(e) => update(row.key, { requiresAuthorization: e.target.checked })}
              />
              Autorización
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Quitar la práctica ${index + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((current) => [
              ...current,
              { key: Math.max(...current.map((r) => r.key)) + 1, practiceId: '', insurerAmount: '', patientCopay: '0', requiresAuthorization: false },
            ])
          }
        >
          <Plus className="size-4" aria-hidden />
          Agregar práctica
        </Button>
      </fieldset>
      <FormError error={save.error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!valid || save.isPending}>
          Guardar convenio
        </Button>
      </DialogFooter>
    </form>
  )
}
