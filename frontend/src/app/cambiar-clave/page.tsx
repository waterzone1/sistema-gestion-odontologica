'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { AuthCard } from '@/components/auth-card'
import { LoadingBlock } from '@/components/page-header'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { sessionKey, useLogout, useSession } from '@/hooks/use-session'
import { api, ApiError, passwordProblems } from '@/lib/api'

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresá tu contraseña actual'),
    newPassword: z.string().min(10, 'Debe tener al menos 10 caracteres'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'Las contraseñas no coinciden',
  })
type Values = z.infer<typeof schema>

export default function ChangePasswordPage() {
  const router = useRouter()
  const client = useQueryClient()
  const session = useSession()
  const logout = useLogout()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const change = useMutation({
    mutationFn: (v: Values) =>
      api.post('/api/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: sessionKey })
      router.replace('/dashboard')
    },
  })

  const noSession = session.data === null
  useEffect(() => {
    if (noSession) router.replace('/login')
  }, [noSession, router])

  if (session.isPending || !session.data) return <LoadingBlock />
  const forced = session.data.user.mustChangePassword

  const error = change.error
  const problemas = passwordProblems(error)
  const message = error instanceof ApiError ? error.message : error ? 'No se pudo conectar con el servidor.' : null

  return (
    <AuthCard
      title="Cambiar contraseña"
      description={forced ? 'Tu contraseña es temporal: elegí una nueva para continuar.' : undefined}
    >
      <form onSubmit={handleSubmit((v) => change.mutate(v))} className="space-y-4" noValidate>
        {message && (
          <Alert>
            <p>{message}</p>
            {problemas.length > 0 && (
              <ul className="list-disc pl-4">
                {problemas.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        <Field label="Contraseña actual" htmlFor="currentPassword" error={errors.currentPassword?.message}>
          <Input id="currentPassword" type="password" autoComplete="current-password" autoFocus {...register('currentPassword')} aria-invalid={!!errors.currentPassword} />
        </Field>
        <Field label="Nueva contraseña" htmlFor="newPassword" error={errors.newPassword?.message} hint="Al menos 10 caracteres.">
          <Input id="newPassword" type="password" autoComplete="new-password" {...register('newPassword')} aria-invalid={!!errors.newPassword} />
        </Field>
        <Field label="Repetir nueva contraseña" htmlFor="confirm" error={errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} aria-invalid={!!errors.confirm} />
        </Field>
        <div className="flex justify-between gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => logout.mutate()}>
            Salir
          </Button>
          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </div>
      </form>
    </AuthCard>
  )
}
