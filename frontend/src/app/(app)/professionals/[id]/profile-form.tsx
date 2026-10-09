'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { FormError } from '@/components/form-error'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useSaveProfessional } from '@/hooks/use-catalog'
import type { Professional } from '@/lib/api'

const schema = z.object({
  licenseNumber: z.string().trim().min(1, 'Ingresá la matrícula').max(40),
  phone: z
    .string()
    .trim()
    .refine((value) => value === '' || /^[\d\s+()-]{6,40}$/.test(value), 'Teléfono inválido'),
  email: z
    .string()
    .trim()
    .refine((value) => value === '' || z.email().safeParse(value).success, 'Email inválido'),
  active: z.boolean(),
})
type Values = z.infer<typeof schema>

export function ProfileForm({ professional, editable }: { professional: Professional; editable: boolean }) {
  const save = useSaveProfessional(professional.userId)
  const [saved, setSaved] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      licenseNumber: professional.licenseNumber,
      phone: professional.phone ?? '',
      email: professional.email ?? '',
      active: professional.active,
    },
  })

  return (
    <form
      onSubmit={handleSubmit((values) => {
        setSaved(false)
        save.mutate(
          { ...values, phone: values.phone || null, email: values.email || null },
          { onSuccess: () => setSaved(true) },
        )
      })}
      className="max-w-xl space-y-4 rounded-lg border bg-card p-5 shadow-sm"
      noValidate
    >
      <FormError error={save.error} />
      {saved && <Alert variant="info">Datos guardados.</Alert>}
      <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
        <Field label="Matrícula" htmlFor="licenseNumber" error={errors.licenseNumber?.message}>
          <Input id="licenseNumber" {...register('licenseNumber')} aria-invalid={!!errors.licenseNumber} />
        </Field>
        <Field label="Teléfono" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" type="tel" {...register('phone')} aria-invalid={!!errors.phone} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message} className="sm:col-span-2">
          <Input id="email" type="email" {...register('email')} aria-invalid={!!errors.email} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" {...register('active')} />
          Activo: puede recibir turnos
        </label>
      </fieldset>
      {editable && (
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar datos'}
          </Button>
        </div>
      )}
    </form>
  )
}
