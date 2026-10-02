'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { AuthCard } from '@/components/auth-card'
import { LoadingBlock } from '@/components/page-header'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { sessionKey, useSetupStatus } from '@/hooks/use-session'
import { api, setCsrfToken, type SessionResponse } from '@/lib/api'

const schema = z
  .object({
    setupToken: z.string().trim().min(1, 'Ingresá el código de instalación'),
    organizationName: z.string().trim().min(2, 'Ingresá el nombre de la organización'),
    branchName: z.string().trim().min(2, 'Ingresá el nombre de la sede'),
    branchAddress: z.string().trim().optional(),
    branchPhone: z.string().trim().optional(),
    displayName: z.string().trim().min(2, 'Ingresá tu nombre'),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'Debe tener al menos 3 caracteres')
      .regex(/^[a-z0-9._-]+$/, 'Solo letras, números, punto, guion y guion bajo'),
    password: z.string().min(10, 'Debe tener al menos 10 caracteres'),
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Las contraseñas no coinciden',
  })
type Values = z.infer<typeof schema>

const STEPS: { title: string; fields: (keyof Values)[] }[] = [
  { title: 'Organización', fields: ['setupToken', 'organizationName'] },
  { title: 'Primera sede', fields: ['branchName', 'branchAddress', 'branchPhone'] },
  { title: 'Administrador', fields: ['displayName', 'username', 'password', 'passwordConfirm'] },
]

export default function SetupPage() {
  const router = useRouter()
  const client = useQueryClient()
  const status = useSetupStatus()
  const [step, setStep] = useState(0)

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onTouched' })

  const setup = useMutation({
    mutationFn: (v: Values) =>
      api.post<SessionResponse>('/api/setup', {
        setupToken: v.setupToken,
        organization: { name: v.organizationName },
        branch: { name: v.branchName, address: v.branchAddress || null, phone: v.branchPhone || null },
        admin: { username: v.username, displayName: v.displayName, password: v.password },
      }),
    onSuccess: (session) => {
      setCsrfToken(session.csrfToken)
      client.setQueryData(sessionKey, session)
      client.setQueryData(['setup-status'], { needsSetup: false })
      router.replace('/dashboard')
    },
  })

  const needsSetup = status.data?.needsSetup
  useEffect(() => {
    if (needsSetup === false && !setup.isSuccess) router.replace('/login')
  }, [needsSetup, setup.isSuccess, router])

  if (status.isPending || needsSetup === false) return <LoadingBlock />

  const last = step === STEPS.length - 1
  const next = async () => {
    if (await trigger(STEPS[step]?.fields)) setStep((s) => s + 1)
  }

  return (
    <AuthCard
      title="Configuración inicial"
      description={`Paso ${step + 1} de ${STEPS.length}: ${STEPS[step]?.title ?? ''}`}
    >
      <form
        onSubmit={handleSubmit((values) => {
          setup.mutate(values)
        })}
        className="space-y-4"
        noValidate
      >
        <FormError error={setup.error} />

        {step === 0 && (
          <>
            <Field
              label="Código de instalación"
              htmlFor="setupToken"
              error={errors.setupToken?.message}
              hint="Lo muestra el servidor en su registro al iniciar (docker compose logs backend)."
            >
              <Input id="setupToken" autoComplete="off" autoFocus {...register('setupToken')} aria-invalid={!!errors.setupToken} />
            </Field>
            <Field label="Nombre de la organización" htmlFor="organizationName" error={errors.organizationName?.message}>
              <Input id="organizationName" {...register('organizationName')} aria-invalid={!!errors.organizationName} />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Nombre de la sede" htmlFor="branchName" error={errors.branchName?.message}>
              <Input id="branchName" autoFocus {...register('branchName')} aria-invalid={!!errors.branchName} />
            </Field>
            <Field label="Dirección (opcional)" htmlFor="branchAddress">
              <Input id="branchAddress" {...register('branchAddress')} />
            </Field>
            <Field label="Teléfono (opcional)" htmlFor="branchPhone">
              <Input id="branchPhone" type="tel" {...register('branchPhone')} />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Nombre y apellido" htmlFor="displayName" error={errors.displayName?.message}>
              <Input id="displayName" autoComplete="name" autoFocus {...register('displayName')} aria-invalid={!!errors.displayName} />
            </Field>
            <Field label="Usuario" htmlFor="username" error={errors.username?.message}>
              <Input id="username" autoComplete="username" {...register('username')} aria-invalid={!!errors.username} />
            </Field>
            <Field
              label="Contraseña"
              htmlFor="password"
              error={errors.password?.message}
              hint="Al menos 10 caracteres. Evitá claves comunes o que incluyan tu usuario."
            >
              <Input id="password" type="password" autoComplete="new-password" {...register('password')} aria-invalid={!!errors.password} />
            </Field>
            <Field label="Repetir contraseña" htmlFor="passwordConfirm" error={errors.passwordConfirm?.message}>
              <Input id="passwordConfirm" type="password" autoComplete="new-password" {...register('passwordConfirm')} aria-invalid={!!errors.passwordConfirm} />
            </Field>
          </>
        )}

        <div className="flex justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0 || setup.isPending}
          >
            Atrás
          </Button>
          {last ? (
            <Button type="submit" disabled={setup.isPending}>
              {setup.isPending ? 'Configurando…' : 'Finalizar'}
            </Button>
          ) : (
            <Button type="button" onClick={() => void next()}>
              Siguiente
            </Button>
          )}
        </div>
      </form>
    </AuthCard>
  )
}
