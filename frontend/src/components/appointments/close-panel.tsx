'use client'

import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { useCloseAppointment } from '@/hooks/use-appointments'
import { useTreatmentPlans } from '@/hooks/use-treatment'
import type { Appointment } from '@/lib/api'
import { ITEM_STATUS_LABELS } from '@/lib/treatment'

interface Props {
  appointment: Appointment
  kind: 'TREATMENT_SESSION' | 'NO_CHARGE'
  onDone: (appointment: Appointment) => void
  onCancel: () => void
}

export function ClosePanel({ appointment, kind, onDone, onCancel }: Props) {
  const close = useCloseAppointment(appointment.id)
  const plans = useTreatmentPlans(appointment.patient.id, kind === 'TREATMENT_SESSION')
  const [itemId, setItemId] = useState('')
  const [reason, setReason] = useState('')

  const items = (plans.data ?? []).flatMap((plan) =>
    plan.status === 'CANCELLED' ? [] : plan.items.filter((item) => item.status !== 'CANCELLED').map((item) => ({ item, plan })),
  )
  const ready = kind === 'TREATMENT_SESSION' ? itemId !== '' : reason.trim().length >= 3

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      {kind === 'TREATMENT_SESSION' ? (
        <Field
          label="¿De qué tratamiento es esta sesión?"
          htmlFor="closure-item"
          hint="Para tratamientos de varios turnos que se cobran una sola vez."
        >
          <Select id="closure-item" value={itemId} onChange={(event) => setItemId(event.target.value)}>
            <option value="">{items.length === 0 && !plans.isPending ? 'El paciente no tiene planes vigentes' : 'Elegí un ítem del plan'}</option>
            {items.map(({ item, plan }) => (
              <option key={item.id} value={item.id}>
                {item.practice.name} · {ITEM_STATUS_LABELS[item.status]}
                {plan.title ? ` · ${plan.title}` : ''}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Motivo" htmlFor="closure-reason" hint="Por ejemplo: control, retiro de puntos, consulta sin cargo.">
          <Input id="closure-reason" autoFocus maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      )}
      <FormError error={close.error} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={close.isPending}>
          Volver
        </Button>
        <Button
          size="sm"
          disabled={!ready || close.isPending}
          onClick={() =>
            close.mutate(
              kind === 'TREATMENT_SESSION' ? { kind, treatmentItemId: itemId } : { kind, reason: reason.trim() },
              { onSuccess: onDone },
            )
          }
        >
          {kind === 'TREATMENT_SESSION' ? 'Cerrar como sesión' : 'Cerrar sin cargo'}
        </Button>
      </div>
    </div>
  )
}
