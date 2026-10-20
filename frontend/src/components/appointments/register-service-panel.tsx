'use client'

import { useState } from 'react'
import { CoverageNotice, coverageInput, coverageReady, type CoverageChoice } from '@/components/billing/coverage-notice'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/input'
import { useRecordService } from '@/hooks/use-billing'
import { usePractices } from '@/hooks/use-catalog'
import { useCoverageQuote } from '@/hooks/use-coverages'
import { useTreatmentPlans } from '@/hooks/use-treatment'
import type { Appointment } from '@/lib/api'
import { isBillableItem, itemLocation } from '@/lib/treatment'

interface Props {
  appointment: Appointment
  onDone: () => void
  onCancel: () => void
}

export function RegisterServicePanel({ appointment, onDone, onCancel }: Props) {
  const patientId = appointment.patient.id
  const practices = usePractices('active')
  const plans = useTreatmentPlans(patientId)
  const record = useRecordService(patientId)
  const [choice, setChoice] = useState(appointment.practice ? `practice:${appointment.practice.id}` : '')

  const openItems = (plans.data ?? []).flatMap((plan) =>
    plan.status === 'CANCELLED'
      ? []
      : plan.items.filter(isBillableItem).map((item) => ({ item, plan })),
  )

  const [coverage, setCoverage] = useState<CoverageChoice>({ apply: true, authorizationCode: '' })
  const [kind, chosenId] = choice.split(':')
  const practiceId = kind === 'item' ? openItems.find(({ item }) => item.id === chosenId)?.item.practice.id : chosenId
  const quote = useCoverageQuote(patientId, practiceId ?? null)

  const submit = () => {
    record.mutate(
      {
        ...(kind === 'item' ? { treatmentItemId: chosenId } : { practiceId: chosenId }),
        ...coverageInput(quote.data, coverage),
        professionalId: appointment.professional.id,
        appointmentId: appointment.id,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <Field label="Qué se realizó" htmlFor="service-choice" hint={`A nombre de ${appointment.professional.displayName}.`}>
        <Select id="service-choice" value={choice} onChange={(event) => setChoice(event.target.value)}>
          <option value="">Elegí una práctica</option>
          {openItems.length > 0 && (
            <optgroup label="Del plan de tratamiento">
              {openItems.map(({ item, plan }) => (
                <option key={item.id} value={`item:${item.id}`}>
                  {item.practice.name}
                  {itemLocation(item) ? ` · ${itemLocation(item)}` : ''}
                  {plan.title ? ` · ${plan.title}` : ''}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Prácticas del catálogo">
            {(practices.data ?? []).map((practice) => (
              <option key={practice.id} value={`practice:${practice.id}`}>
                {practice.name}
              </option>
            ))}
          </optgroup>
        </Select>
      </Field>
      <CoverageNotice quote={quote.data} value={coverage} onChange={setCoverage} />
      <FormError error={record.error} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={record.isPending}>
          Volver
        </Button>
        <Button size="sm" disabled={!choice || !coverageReady(quote.data, coverage) || record.isPending} onClick={submit}>
          Registrar prestación
        </Button>
      </div>
    </div>
  )
}
