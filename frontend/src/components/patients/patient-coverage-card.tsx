'use client'

import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { useAddPatientCoverage, useArchivePatientCoverage, useCoverageProviders, usePatientCoverages } from '@/hooks/use-coverages'
import type { PatientCoverage } from '@/lib/api'
import { formatDate, parseDateText, toDateText } from '@/lib/format'
import { DateInput } from '@/components/ui/date-input'

interface Props {
  patientId: string
  canWrite: boolean
}

function validity(coverage: PatientCoverage) {
  return `Desde ${formatDate(coverage.validFrom)}${coverage.validTo ? ` hasta ${formatDate(coverage.validTo)}` : ''}`
}

export function PatientCoverageCard({ patientId, canWrite }: Props) {
  const coverages = usePatientCoverages(patientId)
  const archive = useArchivePatientCoverage(patientId)
  const [adding, setAdding] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const current = (coverages.data ?? []).find((c) => !c.archived && c.primary)
  const history = (coverages.data ?? []).filter((c) => c !== current)

  return (
    <section aria-label="Cobertura" className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <ShieldCheck className="size-4" aria-hidden />
          Cobertura
        </h2>
        {canWrite && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            {current ? 'Cambiar' : 'Asignar'}
          </Button>
        )}
      </div>
      {coverages.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : current ? (
        <div className="flex items-start justify-between gap-2 text-sm">
          <p>
            <span className="font-medium">
              {current.provider.name} · {current.plan.name}
            </span>
            <span className="block text-xs text-muted-foreground">
              Afiliado {current.affiliateNumber} · {validity(current)}
              {current.notes && ` · ${current.notes}`}
            </span>
          </p>
          {canWrite && (
            <Button variant="outline" size="sm" disabled={archive.isPending} onClick={() => archive.mutate(current.id)}>
              Quitar
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Particular: no tiene cobertura asignada.</p>
      )}
      <FormError error={archive.error ?? coverages.error} className="mt-2" />
      {adding && <CoverageForm patientId={patientId} onDone={() => setAdding(false)} />}
      {history.length > 0 && (
        <div className="mt-3">
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? 'Ocultar historial' : `Ver historial (${history.length})`}
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {history.map((coverage) => (
                <li key={coverage.id}>
                  {coverage.provider.name} {coverage.plan.name} · Afiliado {coverage.affiliateNumber} · {validity(coverage)}
                  {coverage.archived && ' · Archivada'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function CoverageForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const providers = useCoverageProviders()
  const add = useAddPatientCoverage(patientId)
  const [providerId, setProviderId] = useState('')
  const [planId, setPlanId] = useState('')
  const [affiliate, setAffiliate] = useState('')
  const [from, setFrom] = useState(() => toDateText(new Date()))
  const [to, setTo] = useState('')
  const active = (providers.data ?? []).filter((p) => p.active)
  const plans = active.find((p) => p.id === providerId)?.plans.filter((plan) => plan.active) ?? []
  const validFrom = parseDateText(from)
  const validTo = to ? parseDateText(to) : null
  const valid = planId !== '' && affiliate.trim() !== '' && validFrom !== null && (to === '' || validTo !== null)

  return (
    <form
      className="mt-4 space-y-3 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!validFrom) return
        add.mutate(
          { planId, affiliateNumber: affiliate.trim(), validFrom, ...(validTo ? { validTo } : {}) },
          { onSuccess: onDone },
        )
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Obra social o prepaga" htmlFor="coverage-provider">
          <Select
            id="coverage-provider"
            value={providerId}
            onChange={(event) => {
              setProviderId(event.target.value)
              setPlanId('')
            }}
          >
            <option value="">{active.length === 0 ? 'No hay coberturas cargadas' : 'Elegí una'}</option>
            {active.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Plan" htmlFor="coverage-plan">
          <Select id="coverage-plan" value={planId} disabled={!providerId} onChange={(event) => setPlanId(event.target.value)}>
            <option value="">Elegí un plan</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Número de afiliado" htmlFor="coverage-affiliate">
          <Input id="coverage-affiliate" maxLength={40} value={affiliate} onChange={(event) => setAffiliate(event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde" htmlFor="coverage-from">
            <DateInput id="coverage-from" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Hasta (opcional)" htmlFor="coverage-to">
            <DateInput id="coverage-to" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Si ya tenía una cobertura principal, queda archivada en el historial.</p>
      <FormError error={add.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={add.isPending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={!valid || add.isPending}>
          Guardar cobertura
        </Button>
      </div>
    </form>
  )
}
