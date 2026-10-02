'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { api, type User } from '@/lib/api'

const schema = z.object({ password: z.string().min(10, 'Debe tener al menos 10 caracteres') })
type Values = z.infer<typeof schema>

interface Props {
  user: User | null
  onOpenChange: (open: boolean) => void
  onDone: (message: string) => void
}

export function ResetPasswordDialog({ user, onOpenChange, onDone }: Props) {
  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      {user && (
        <DialogContent
          title={`Restablecer contraseña de ${user.displayName}`}
          description="Se cierran todas sus sesiones y tendrá que cambiar esta contraseña temporal al ingresar."
        >
          <ResetForm user={user} onClose={() => onOpenChange(false)} onDone={onDone} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function ResetForm({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: (m: string) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const reset = useMutation({
    mutationFn: (v: Values) => api.post(`/api/users/${user.id}/reset-password`, v),
    onSuccess: () => {
      onDone(`Contraseña de ${user.displayName} restablecida.`)
      onClose()
    },
  })

  return (
    <form onSubmit={handleSubmit((v) => reset.mutate(v))} className="space-y-4" noValidate>
      <FormError error={reset.error} />
      <Field label="Contraseña temporal" htmlFor="temp-password" error={errors.password?.message}>
        <Input id="temp-password" type="text" autoComplete="off" autoFocus {...register('password')} aria-invalid={!!errors.password} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={reset.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={reset.isPending}>
          {reset.isPending ? 'Guardando…' : 'Restablecer'}
        </Button>
      </DialogFooter>
    </form>
  )
}
