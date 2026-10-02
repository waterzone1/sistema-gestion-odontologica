'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { EmptyState, LoadingBlock, PageHeader } from '@/components/page-header'
import { FormError } from '@/components/form-error'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { branchesKey, useBranches } from '@/hooks/use-admin'
import { useSession } from '@/hooks/use-session'
import { api, type Branch } from '@/lib/api'
import { can } from '@/lib/permissions'

const schema = z.object({
  name: z.string().trim().min(2, 'Ingresá el nombre de la sede'),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
})
type Values = z.infer<typeof schema>

type Editing = { kind: 'create' } | { kind: 'edit'; branch: Branch } | null

export default function BranchesPage() {
  const router = useRouter()
  const client = useQueryClient()
  const session = useSession()
  const me = session.data?.user
  const allowed = can(me, 'branches:manage')
  const branches = useBranches(allowed)
  const [editing, setEditing] = useState<Editing>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (me && !allowed) router.replace('/dashboard')
  }, [me, allowed, router])

  const toggle = useMutation({
    mutationFn: (branch: Branch) => api.patch<Branch>(`/api/branches/${branch.id}`, { active: !branch.active }),
    onSuccess: async (branch) => {
      await client.invalidateQueries({ queryKey: branchesKey })
      setNotice(branch.active ? `${branch.name} fue reactivada.` : `${branch.name} fue desactivada.`)
    },
  })

  if (!me || !allowed || branches.isPending) return <LoadingBlock />
  if (branches.isError) return <FormError error={branches.error} />

  return (
    <>
      <PageHeader
        title="Sedes"
        description="Lugares de atención de la organización."
        actions={
          <Button onClick={() => setEditing({ kind: 'create' })}>
            <Plus className="size-4" aria-hidden />
            Nueva sede
          </Button>
        }
      />

      {notice && <Alert variant="info" className="mb-4">{notice}</Alert>}
      <FormError error={toggle.error} className="mb-4" />

      {branches.data.length === 0 ? (
        <EmptyState title="Todavía no hay sedes" />
      ) : (
        <ul className="divide-y rounded-lg border bg-card shadow-sm">
          {branches.data.map((branch) => (
            <li key={branch.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {branch.name}
                  {branch.active ? <Badge variant="success">Activa</Badge> : <Badge variant="muted">Inactiva</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[branch.address, branch.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setEditing({ kind: 'edit', branch })}>
                  Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggle.mutate(branch)} disabled={toggle.isPending}>
                  {branch.active ? 'Desactivar' : 'Reactivar'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <DialogContent title={editing.kind === 'edit' ? 'Editar sede' : 'Nueva sede'}>
            <BranchForm
              branch={editing.kind === 'edit' ? editing.branch : null}
              onClose={() => setEditing(null)}
              onSaved={setNotice}
            />
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}

function BranchForm({ branch, onClose, onSaved }: { branch: Branch | null; onClose: () => void; onSaved: (m: string) => void }) {
  const client = useQueryClient()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: branch?.name ?? '', address: branch?.address ?? '', phone: branch?.phone ?? '' },
  })

  const save = useMutation({
    mutationFn: (v: Values) =>
      branch
        ? api.patch<Branch>(`/api/branches/${branch.id}`, v)
        : api.post<Branch>('/api/branches', v),
    onSuccess: async (saved) => {
      await client.invalidateQueries({ queryKey: branchesKey })
      onSaved(branch ? 'Cambios guardados.' : `${saved.name} fue creada.`)
      onClose()
    },
  })

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <FormError error={save.error} />
      <Field label="Nombre" htmlFor="name" error={errors.name?.message}>
        <Input id="name" autoFocus {...register('name')} aria-invalid={!!errors.name} />
      </Field>
      <Field label="Dirección (opcional)" htmlFor="address">
        <Input id="address" {...register('address')} />
      </Field>
      <Field label="Teléfono (opcional)" htmlFor="phone">
        <Input id="phone" type="tel" {...register('phone')} />
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
