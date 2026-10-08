'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { patientsKey } from '@/hooks/use-patients'
import { api, ApiError, type Patient } from '@/lib/api'

const DOCUMENT_TYPES = [
  { value: 'DNI', label: 'DNI' },
  { value: 'LE', label: 'Libreta de enrolamiento' },
  { value: 'LC', label: 'Libreta cívica' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'OTRO', label: 'Otro' },
] as const

const schema = z.object({
  firstName: z.string().trim().min(1, 'Ingresá el nombre'),
  lastName: z.string().trim().min(1, 'Ingresá el apellido'),
  documentType: z.enum(['DNI', 'LE', 'LC', 'PASAPORTE', 'OTRO']),
  documentNumber: z.string().trim(),
  birthDate: z.string().trim(),
  phone: z.string().trim(),
  email: z
    .string()
    .trim()
    .refine((value) => value === '' || z.email().safeParse(value).success, 'Email inválido'),
  address: z.string().trim(),
  emergencyContact: z.string().trim(),
})
type Values = z.infer<typeof schema>

const emptyToNull = (value: string) => (value === '' ? null : value)

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  patient: Patient | null
  onSaved: (patient: Patient) => void
}

export function PatientFormDialog({ open, onOpenChange, patient, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          title={patient ? 'Editar paciente' : 'Nuevo paciente'}
          description="Datos administrativos. Los datos clínicos se cargan desde la historia clínica."
          className="max-w-2xl"
        >
          <PatientForm patient={patient} onClose={() => onOpenChange(false)} onSaved={onSaved} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function PatientForm({
  patient,
  onClose,
  onSaved,
}: {
  patient: Patient | null
  onClose: () => void
  onSaved: (patient: Patient) => void
}) {
  const client = useQueryClient()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: patient?.firstName ?? '',
      lastName: patient?.lastName ?? '',
      documentType: patient?.documentType ?? 'DNI',
      documentNumber: patient?.documentNumber ?? '',
      birthDate: patient?.birthDate ?? '',
      phone: patient?.phone ?? '',
      email: patient?.email ?? '',
      address: patient?.address ?? '',
      emergencyContact: patient?.emergencyContact ?? '',
    },
  })

  const save = useMutation({
    mutationFn: (values: Values) => {
      const body = {
        ...values,
        documentNumber: emptyToNull(values.documentNumber),
        birthDate: emptyToNull(values.birthDate),
        phone: emptyToNull(values.phone),
        email: emptyToNull(values.email),
        address: emptyToNull(values.address),
        emergencyContact: emptyToNull(values.emergencyContact),
      }
      return patient
        ? api.patch<Patient>(`/api/patients/${patient.id}`, body)
        : api.post<Patient>('/api/patients', body)
    },
    onSuccess: async (saved) => {
      await client.invalidateQueries({ queryKey: patientsKey })
      onSaved(saved)
      onClose()
    },
  })

  const duplicate =
    save.error instanceof ApiError && save.error.code === 'DUPLICATE_PATIENT'
      ? (save.error.details as { patientId?: string | null; fullName?: string | null })
      : null

  return (
    <form onSubmit={handleSubmit((values) => save.mutate(values))} className="space-y-6" noValidate>
      <FormError error={save.error} />
      {duplicate?.patientId && (
        <p className="text-sm">
          <Link href={`/patients/${duplicate.patientId}`} className="font-medium text-primary underline">
            Ver el paciente existente{duplicate.fullName ? `: ${duplicate.fullName}` : ''}
          </Link>
        </p>
      )}

      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-semibold">Identificación</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="firstName" error={errors.firstName?.message}>
            <Input id="firstName" autoFocus {...register('firstName')} aria-invalid={!!errors.firstName} />
          </Field>
          <Field label="Apellido" htmlFor="lastName" error={errors.lastName?.message}>
            <Input id="lastName" {...register('lastName')} aria-invalid={!!errors.lastName} />
          </Field>
          <Field label="Tipo de documento" htmlFor="documentType">
            <Select id="documentType" {...register('documentType')}>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Número de documento" htmlFor="documentNumber" hint="Opcional. Puede escribirse con puntos.">
            <Input id="documentNumber" inputMode="text" {...register('documentNumber')} />
          </Field>
          <Field label="Fecha de nacimiento" htmlFor="birthDate">
            <Input id="birthDate" type="date" {...register('birthDate')} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-semibold">Contacto</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teléfono" htmlFor="phone">
            <Input id="phone" type="tel" {...register('phone')} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" {...register('email')} aria-invalid={!!errors.email} />
          </Field>
          <Field label="Dirección" htmlFor="address">
            <Input id="address" {...register('address')} />
          </Field>
          <Field label="Contacto de emergencia" htmlFor="emergencyContact" hint="Nombre y teléfono">
            <Input id="emergencyContact" {...register('emergencyContact')} />
          </Field>
        </div>
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : patient ? 'Guardar cambios' : 'Crear paciente'}
        </Button>
      </DialogFooter>
    </form>
  )
}
