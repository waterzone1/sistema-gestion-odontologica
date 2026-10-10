'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { FormError } from '@/components/form-error'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useSaveProfessional } from '@/hooks/use-catalog'
import type { Professional } from '@/lib/api'
import { colorVar, PROFESSIONAL_COLORS, type ProfessionalColor } from '@/lib/professional-colors'
import { cn } from '@/lib/utils'

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
  color: z.string().nullable(),
})
type Values = z.infer<typeof schema>

export function ProfileForm({ professional, editable }: { professional: Professional; editable: boolean }) {
  const save = useSaveProfessional(professional.userId)
  const [saved, setSaved] = useState(false)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      licenseNumber: professional.licenseNumber,
      phone: professional.phone ?? '',
      email: professional.email ?? '',
      active: professional.active,
      color: professional.color,
    },
  })

  return (
    <form
      onSubmit={handleSubmit((values) => {
        setSaved(false)
        save.mutate(
          {
            ...values,
            phone: values.phone || null,
            email: values.email || null,
            color: values.color as ProfessionalColor | null,
          },
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
        <Controller
          control={control}
          name="color"
          render={({ field }) => (
            <div role="radiogroup" aria-label="Color en la agenda" className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium">Color en la agenda</p>
              <div className="flex flex-wrap gap-2">
                {PROFESSIONAL_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    role="radio"
                    aria-checked={field.value === color.value}
                    aria-label={color.label}
                    title={color.label}
                    onClick={() => field.onChange(color.value)}
                    className={cn(
                      'size-8 rounded-full border-2 border-transparent transition-transform hover:scale-110',
                      field.value === color.value && 'border-foreground ring-2 ring-ring',
                    )}
                    style={{ backgroundColor: colorVar(color.value) }}
                  />
                ))}
              </div>
            </div>
          )}
        />
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
