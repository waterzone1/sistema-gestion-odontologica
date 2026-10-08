'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { FormError } from '@/components/form-error'
import { PatientPicker, type PickedPatient } from '@/components/patient-picker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { appointmentsKey } from '@/hooks/use-appointments'
import { api, type Appointment, type Branch, type Practice, type Professional } from '@/lib/api'
import { toDateTimeInput } from '@/lib/format'

const schema = z.object({
  branchId: z.string().min(1, 'Elegí la sede'),
  professionalId: z.string().min(1, 'Elegí el profesional'),
  practiceId: z.string(),
  start: z.string().min(1, 'Indicá la fecha y la hora'),
  durationMinutes: z
    .number('Indicá la duración')
    .int('Indicá minutos enteros')
    .min(5, 'Mínimo 5 minutos')
    .max(480, 'Máximo 8 horas'),
  notes: z.string().trim().max(500, 'Máximo 500 caracteres'),
})
type Values = z.infer<typeof schema>

export interface AppointmentDefaults {
  start: Date
  durationMinutes: number
  patient?: PickedPatient | null
  branchId?: string
  professionalId?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  appointment: Appointment | null
  defaults: AppointmentDefaults | null
  branches: Branch[]
  professionals: Professional[]
  practices: Practice[]
}

export function AppointmentFormDialog(props: Props) {
  const { open, onOpenChange, appointment } = props
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          title={appointment ? 'Editar o reprogramar turno' : 'Nuevo turno'}
          description={
            appointment
              ? 'Si cambiás el horario de un turno confirmado, vuelve a quedar pendiente de confirmar.'
              : 'El sistema no permite dos turnos superpuestos para un mismo profesional.'
          }
          className="max-w-xl"
        >
          <AppointmentForm {...props} onClose={() => onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function AppointmentForm({
  appointment,
  defaults,
  branches,
  professionals,
  practices,
  onClose,
}: Props & { onClose: () => void }) {
  const client = useQueryClient()
  const editing = appointment !== null
  const [patient, setPatient] = useState<PickedPatient | null>(
    appointment ? { id: appointment.patient.id, fullName: appointment.patient.fullName } : (defaults?.patient ?? null),
  )
  const [patientError, setPatientError] = useState<string | null>(null)

  const startDate = appointment ? new Date(appointment.startsAt) : (defaults?.start ?? new Date())
  const duration = appointment
    ? Math.round((new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) / 60_000)
    : (defaults?.durationMinutes ?? 30)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      branchId: appointment?.branch.id ?? defaults?.branchId ?? branches[0]?.id ?? '',
      professionalId: appointment?.professional.id ?? defaults?.professionalId ?? '',
      practiceId: appointment?.practice?.id ?? '',
      start: toDateTimeInput(startDate),
      durationMinutes: duration,
      notes: appointment?.notes ?? '',
    },
  })
  const branchId = useWatch({ control, name: 'branchId' })
  const availableProfessionals = professionals.filter((p) => p.active && p.branchIds.includes(branchId))

  const save = useMutation({
    mutationFn: (values: Values) => {
      const startsAt = new Date(values.start)
      const endsAt = new Date(startsAt.getTime() + values.durationMinutes * 60_000)
      const body = {
        branchId: values.branchId,
        professionalId: values.professionalId,
        practiceId: values.practiceId || null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        notes: values.notes || null,
      }
      return appointment
        ? api.patch<Appointment>(`/api/appointments/${appointment.id}`, body)
        : api.post<Appointment>('/api/appointments', { ...body, patientId: patient?.id })
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: appointmentsKey })
      onClose()
    },
  })

  const submit = handleSubmit((values) => {
    if (!patient) {
      setPatientError('Elegí el paciente')
      return
    }
    setPatientError(null)
    save.mutate(values)
  })

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError error={save.error} />

      <Field label="Paciente" htmlFor="patient-search" error={patientError ?? undefined}>
        <PatientPicker id="patient-search" value={patient} onChange={setPatient} disabled={editing} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sede" htmlFor="branchId" error={errors.branchId?.message}>
          <Select
            id="branchId"
            {...register('branchId', { onChange: () => setValue('professionalId', '') })}
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Profesional" htmlFor="professionalId" error={errors.professionalId?.message}>
          <Select id="professionalId" {...register('professionalId')}>
            <option value="">Elegí un profesional</option>
            {availableProfessionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.displayName}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Práctica" htmlFor="practiceId" hint="Opcional. Propone la duración habitual.">
        <Select
          id="practiceId"
          {...register('practiceId', {
            onChange: (event: { target: { value: string } }) => {
              const practice = practices.find((p) => p.id === event.target.value)
              if (practice) setValue('durationMinutes', practice.defaultDurationMinutes)
            },
          })}
        >
          <option value="">Sin práctica</option>
          {practices.map((practice) => (
            <option key={practice.id} value={practice.id}>
              {practice.name} ({practice.defaultDurationMinutes} min)
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha y hora de inicio" htmlFor="start" error={errors.start?.message}>
          <Input id="start" type="datetime-local" {...register('start')} aria-invalid={!!errors.start} />
        </Field>
        <Field label="Duración (minutos)" htmlFor="durationMinutes" error={errors.durationMinutes?.message}>
          <Input
            id="durationMinutes"
            type="number"
            min={5}
            max={480}
            step={5}
            {...register('durationMinutes', { valueAsNumber: true })}
            aria-invalid={!!errors.durationMinutes}
          />
        </Field>
      </div>

      <Field label="Notas administrativas" htmlFor="notes" error={errors.notes?.message} hint="No uses este campo para datos clínicos.">
        <Input id="notes" {...register('notes')} />
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear turno'}
        </Button>
      </DialogFooter>
    </form>
  )
}
