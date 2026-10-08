'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock, PageHeader } from '@/components/page-header'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { practicesKey, usePractices } from '@/hooks/use-catalog'
import { useSession } from '@/hooks/use-session'
import { api, type Practice } from '@/lib/api'
import { formatMoney } from '@/lib/format'
import { can } from '@/lib/permissions'

const schema = z.object({
  code: z.string().trim().min(2, 'Ingresá un código de al menos 2 caracteres'),
  name: z.string().trim().min(2, 'Ingresá el nombre de la práctica'),
  basePrice: z
    .string()
    .trim()
    .regex(/^\d{1,12}([.,]\d{1,2})?$/, 'Ingresá un importe, por ejemplo 25000 o 25000,50'),
  defaultDurationMinutes: z
    .number('Indicá la duración')
    .int('Indicá minutos enteros')
    .min(5, 'Mínimo 5 minutos')
    .max(480, 'Máximo 8 horas'),
})
type Values = z.infer<typeof schema>

type Editing = { kind: 'create' } | { kind: 'edit'; practice: Practice } | null

export default function PracticesPage() {
  const router = useRouter()
  const client = useQueryClient()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'practices:manage')
  const practices = usePractices('all', allowed)
  const [editing, setEditing] = useState<Editing>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  const toggle = useMutation({
    mutationFn: (practice: Practice) =>
      api.patch<Practice>(`/api/practices/${practice.id}`, { active: !practice.active }),
    onSuccess: async (practice) => {
      await client.invalidateQueries({ queryKey: practicesKey })
      setNotice(practice.active ? `${practice.name} fue reactivada.` : `${practice.name} fue desactivada.`)
    },
  })

  if (!user || !allowed || practices.isPending) return <LoadingBlock />
  if (practices.isError) return <FormError error={practices.error} />

  return (
    <>
      <PageHeader
        title="Prácticas"
        description="Catálogo de prácticas con su duración habitual y su precio. Cambiar un precio no modifica lo ya registrado."
        actions={
          <Button onClick={() => setEditing({ kind: 'create' })}>
            <Plus className="size-4" aria-hidden />
            Nueva práctica
          </Button>
        }
      />

      {notice && (
        <Alert variant="info" className="mb-4">
          {notice}
        </Alert>
      )}
      <FormError error={toggle.error} className="mb-4" />

      {practices.data.length === 0 ? (
        <EmptyState title="Todavía no hay prácticas" description="Creá la primera con el botón «Nueva práctica»." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Código</th>
                <th scope="col" className="px-4 py-2 font-medium">Práctica</th>
                <th scope="col" className="px-4 py-2 font-medium">Duración</th>
                <th scope="col" className="px-4 py-2 font-medium">Precio</th>
                <th scope="col" className="px-4 py-2 font-medium">Estado</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {practices.data.map((practice) => (
                <tr key={practice.id} className={practice.active ? undefined : 'text-muted-foreground'}>
                  <td className="px-4 py-3 font-mono text-xs">{practice.code}</td>
                  <td className="px-4 py-3 font-medium">{practice.name}</td>
                  <td className="px-4 py-3">{practice.defaultDurationMinutes} min</td>
                  <td className="px-4 py-3">{formatMoney(practice.basePrice)}</td>
                  <td className="px-4 py-3">
                    {practice.active ? <Badge variant="success">Activa</Badge> : <Badge variant="muted">Inactiva</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing({ kind: 'edit', practice })}>
                        Editar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggle.mutate(practice)} disabled={toggle.isPending}>
                        {practice.active ? 'Desactivar' : 'Reactivar'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <DialogContent title={editing.kind === 'edit' ? 'Editar práctica' : 'Nueva práctica'}>
            <PracticeForm
              practice={editing.kind === 'edit' ? editing.practice : null}
              onClose={() => setEditing(null)}
              onSaved={setNotice}
            />
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}

function PracticeForm({
  practice,
  onClose,
  onSaved,
}: {
  practice: Practice | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const client = useQueryClient()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: practice?.code ?? '',
      name: practice?.name ?? '',
      basePrice: practice?.basePrice ?? '',
      defaultDurationMinutes: practice?.defaultDurationMinutes ?? 30,
    },
  })

  const save = useMutation({
    mutationFn: (values: Values) => {
      const body = { ...values, basePrice: values.basePrice.replace(',', '.') }
      return practice
        ? api.patch<Practice>(`/api/practices/${practice.id}`, body)
        : api.post<Practice>('/api/practices', body)
    },
    onSuccess: async (saved) => {
      await client.invalidateQueries({ queryKey: practicesKey })
      onSaved(practice ? 'Cambios guardados.' : `${saved.name} fue creada.`)
      onClose()
    },
  })

  return (
    <form onSubmit={handleSubmit((values) => save.mutate(values))} className="space-y-4" noValidate>
      <FormError error={save.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código" htmlFor="code" error={errors.code?.message} hint="Se guarda en mayúsculas.">
          <Input id="code" autoFocus {...register('code')} aria-invalid={!!errors.code} />
        </Field>
        <Field label="Duración (minutos)" htmlFor="defaultDurationMinutes" error={errors.defaultDurationMinutes?.message}>
          <Input
            id="defaultDurationMinutes"
            type="number"
            min={5}
            max={480}
            step={5}
            {...register('defaultDurationMinutes', { valueAsNumber: true })}
            aria-invalid={!!errors.defaultDurationMinutes}
          />
        </Field>
      </div>
      <Field label="Nombre" htmlFor="name" error={errors.name?.message}>
        <Input id="name" {...register('name')} aria-invalid={!!errors.name} />
      </Field>
      <Field label="Precio (ARS)" htmlFor="basePrice" error={errors.basePrice?.message}>
        <Input id="basePrice" inputMode="decimal" {...register('basePrice')} aria-invalid={!!errors.basePrice} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  )
}
