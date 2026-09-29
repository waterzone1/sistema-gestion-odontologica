'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiStatus } from '@/components/api-status'
import { AuthCard } from '@/components/auth-card'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useLogin, useSession, useSetupStatus } from '@/hooks/use-session'
import { ApiError } from '@/lib/api'

const schema = z.object({
  username: z.string().trim().min(1, 'Ingresá tu usuario'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
})
type Values = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const session = useSession()
  const setup = useSetupStatus()
  const login = useLogin()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const user = session.data?.user
  const needsSetup = setup.data?.needsSetup
  useEffect(() => {
    if (user) router.replace(user.mustChangePassword ? '/cambiar-clave' : '/dashboard')
    else if (needsSetup) router.replace('/setup')
  }, [user, needsSetup, router])

  const onSubmit = handleSubmit((values) => {
    login.mutate(values)
  })

  const error = login.error
  const message =
    error instanceof ApiError
      ? error.message
      : error
        ? 'No se pudo conectar con el servidor. Probá de nuevo.'
        : null

  return (
    <AuthCard
      title="Iniciar sesión"
      description="Ingresá con tu usuario y contraseña."
      footer={<div className="text-center"><ApiStatus compact /></div>}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {message && <Alert>{message}</Alert>}
        <Field label="Usuario" htmlFor="username" error={errors.username?.message}>
          <Input id="username" autoComplete="username" autoFocus {...register('username')} aria-invalid={!!errors.username} />
        </Field>
        <Field label="Contraseña" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} aria-invalid={!!errors.password} />
        </Field>
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
    </AuthCard>
  )
}
