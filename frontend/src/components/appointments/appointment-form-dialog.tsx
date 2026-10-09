'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { FormError } from '@/components/form-error'
import { PatientPicker, type PickedPatient } from '@/components/patient-picker'
import { PatientFormDialog } from '@/components/patients/patient-form-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, MaskedInput, Select } from '@/components/ui/input'
import { appointmentsKey } from '@/hooks/use-appointments'
import { useSession } from '@/hooks/use-session'
import { api, ApiError, type Appointment, type Branch, type Practice, type Professional } from '@/lib/api'
import { fullName, maskDate, maskTime, parseDateTimeText, toDateText, toTimeText } from '@/lib/format'
import { can } from '@/lib/permissions'

const schema = z.object({
  branchId: z.string().min(1, 'Elegí la sede'),
  professionalId: z.string().min(1, 'Elegí el profesional'),
  practiceId: z.string(),
  date: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Usá el formato dd/mm/aaaa'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato hh:mm (24 h)'),
  durationMinutes: z
    .number('Indicá la duración')
    .int('Indicá minutos enteros')
    .min(5, 'Mínimo 5 minutos')
    .max(480, 'Máximo 8 horas'),
  notes: z.string().trim().max(500, 'Máximo 500 caracteres'),
}).refine((values) => parseDateTimeText(values.date, values.time) !== null, {
  path: ['date'],
  message: 'La fecha no es válida',
})
type Values = z.infer<typeof schema>

export interface AppointmentDefaults {
  start: Date
  durationMinutes: number
  patient?: PickedPatient | null
  lockPatient?: boolean
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
  const [creatingPatient, setCreatingPatient] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [outsideAvailability, setOutsideAvailability] = useState(false)
  const session = useSession()
  const canOverride = can(session.data?.user, 'appointments:override')

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
      date: toDateText(startDate),
      time: toTimeText(startDate),
      durationMinutes: duration,
      notes: appointment?.notes ?? '',
    },
  })
  const branchId = useWatch({ control, name: 'branchId' })
  const professionalId = useWatch({ control, name: 'professionalId' })
  const availableProfessionals = professionals.filter((p) => p.active && p.branchIds.includes(branchId))
  const offered = professionals.find((p) => p.id === professionalId)?.practiceIds ?? []
  const availablePractices = offered.length > 0 ? practices.filter((p) => offered.includes(p.id)) : practices

  const save = useMutation({
    mutationFn: (values: Values) => {
      const startsAt = parseDateTimeText(values.date, values.time) as Date
      const endsAt = new Date(startsAt.getTime() + values.durationMinutes * 60_000)
      const body = {
        branchId: values.branchId,
        professionalId: values.professionalId,
        practiceId: values.practiceId || null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        notes: values.notes || null,
        ...(outsideAvailability && overrideReason.trim() ? { override: { reason: overrideReason.trim() } } : {}),
      }
      return appointment
        ? api.patch<Appointment>(`/api/appointments/${appointment.id}`, body)
        : api.post<Appointment>('/api/appointments', { ...body, patientId: patient?.id })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'OUTSIDE_AVAILABILITY') setOutsideAvailability(true)
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
        <PatientPicker
          id="patient-search"
          value={patient}
          onChange={setPatient}
          disabled={editing || defaults?.lockPatient === true}
        />
      </Field>
      {!patient && (
        <Button type="button" variant="outline" size="sm" onClick={() => setCreatingPatient(true)}>
          Paciente nuevo
        </Button>
      )}
      <PatientFormDialog
        open={creatingPatient}
        onOpenChange={setCreatingPatient}
        patient={null}
        onSaved={(created) => {
          setPatient({ id: created.id, fullName: fullName(created) })
          setCreatingPatient(false)
        }}
      />

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
          {availablePractices.map((practice) => (
            <option key={practice.id} value={practice.id}>
              {practice.name} ({practice.defaultDurationMinutes} min)
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Fecha" htmlFor="date" error={errors.date?.message}>
          <MaskedInput id="date" placeholder="dd/mm/aaaa" mask={maskDate} {...register('date')} aria-invalid={!!errors.date} />
        </Field>
        <Field label="Hora" htmlFor="time" error={errors.time?.message}>
          <MaskedInput id="time" placeholder="hh:mm" mask={maskTime} {...register('time')} aria-invalid={!!errors.time} />
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

      {outsideAvailability && canOverride && (
        <Field
          label="Dar el turno igual (fuera de horario)"
          htmlFor="override-reason"
          hint="Solo administración. Explicá el motivo: queda registrado en la auditoría. Nunca permite superponer turnos."
        >
          <Input
            id="override-reason"
            maxLength={300}
            placeholder="Por ejemplo, urgencia por dolor agudo"
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
          />
        </Field>
      )}

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
