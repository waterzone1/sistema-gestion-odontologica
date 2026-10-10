'use client'

import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/input'
import { useRecordService } from '@/hooks/use-billing'
import { usePractices } from '@/hooks/use-catalog'
import { useTreatmentPlans } from '@/hooks/use-treatment'
import type { Appointment } from '@/lib/api'
import { isOpenItem, itemLocation } from '@/lib/treatment'

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
    plan.status === 'CANCELLED' || plan.status === 'COMPLETED'
      ? []
      : plan.items.filter(isOpenItem).map((item) => ({ item, plan })),
  )

  const submit = () => {
    const [kind, id] = choice.split(':')
    record.mutate(
      {
        ...(kind === 'item' ? { treatmentItemId: id } : { practiceId: id }),
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
      <FormError error={record.error} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={record.isPending}>
          Volver
        </Button>
        <Button size="sm" disabled={!choice || record.isPending} onClick={submit}>
          Registrar prestación
        </Button>
      </div>
    </div>
  )
}
