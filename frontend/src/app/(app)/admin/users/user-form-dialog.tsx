'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '@/components/ui/alert'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { CheckboxGroup } from '@/components/ui/checkbox-group'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { branchesKey, usersKey } from '@/hooks/use-admin'
import { api, type Branch, type Professional, type Role, type User } from '@/lib/api'
import { ALL_ROLES, requiresBranch, ROLE_LABELS } from '@/lib/permissions'

const baseShape = {
  displayName: z.string().trim().min(2, 'Ingresá el nombre'),
  roles: z.array(z.enum(['ADMIN', 'DENTIST', 'RECEPTIONIST'])).min(1, 'Elegí al menos un rol'),
  branchIds: z.array(z.string()),
}

const createSchema = z
  .object({
    ...baseShape,
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'Debe tener al menos 3 caracteres')
      .regex(/^[a-z0-9._-]+$/, 'Solo letras, números, punto, guion y guion bajo'),
    password: z.string().min(10, 'Debe tener al menos 10 caracteres'),
  })
  .refine((v) => !requiresBranch(v.roles) || v.branchIds.length > 0, {
    path: ['branchIds'],
    message: 'Este usuario necesita al menos una sede',
  })

const editSchema = z
  .object(baseShape)
  .refine((v) => !requiresBranch(v.roles) || v.branchIds.length > 0, {
    path: ['branchIds'],
    message: 'Este usuario necesita al menos una sede',
  })

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  branches: Branch[]
  onSaved: (message: string) => void
}

export function UserFormDialog({ open, onOpenChange, user, branches, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          title={user ? `Editar a ${user.displayName}` : 'Nuevo usuario'}
          description={
            user
              ? 'Los cambios de rol se aplican de inmediato, incluso si la persona tiene la sesión abierta.'
              : 'Se crea con una contraseña temporal que la persona debe cambiar al ingresar.'
          }
        >
          <UserForm user={user} branches={branches} onClose={() => onOpenChange(false)} onSaved={onSaved} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function UserForm({
  user,
  branches,
  onClose,
  onSaved,
}: {
  user: User | null
  branches: Branch[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const client = useQueryClient()
  const editing = user !== null
  const form = useForm<CreateValues | EditValues>({
    resolver: zodResolver(editing ? editSchema : createSchema),
    defaultValues: editing
      ? { displayName: user.displayName, roles: user.roles, branchIds: user.branchIds }
      : { username: '', displayName: '', password: '', roles: [], branchIds: [] },
  })
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = form
  const roles = useWatch({ control, name: 'roles' }) as Role[]
  const fieldErrors = errors as Record<string, { message?: string } | undefined>

  const save = useMutation({
    mutationFn: (values: CreateValues | EditValues) =>
      editing ? api.patch<User>(`/api/users/${user.id}`, values) : api.post<User>('/api/users', values),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: usersKey })
      onSaved(editing ? 'Cambios guardados.' : 'Usuario creado. Tiene que cambiar la contraseña temporal al ingresar.')
      onClose()
    },
  })

  const activeBranches = branches.filter((b) => b.active || user?.branchIds.includes(b.id))

  return (
    <>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
        <FormError error={save.error} />

        <Field label="Nombre y apellido" htmlFor="displayName" error={fieldErrors['displayName']?.message}>
          <Input id="displayName" autoFocus {...register('displayName')} aria-invalid={!!fieldErrors['displayName']} />
        </Field>

        {!editing && (
          <>
            <Field label="Usuario" htmlFor="username" error={fieldErrors['username']?.message} hint="Con este nombre ingresa al sistema.">
              <Input id="username" autoComplete="off" {...register('username')} aria-invalid={!!fieldErrors['username']} />
            </Field>
            <Field
              label="Contraseña temporal"
              htmlFor="password"
              error={fieldErrors['password']?.message}
              hint="Al menos 10 caracteres, distinta del usuario. Se la pasás a la persona y la cambia al ingresar."
            >
              <Input id="password" type="text" autoComplete="off" {...register('password')} aria-invalid={!!fieldErrors['password']} />
            </Field>
          </>
        )}

        <Controller
          control={control}
          name="roles"
          render={({ field }) => (
            <CheckboxGroup
              legend="Roles"
              idPrefix="rol"
              options={ALL_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
              value={field.value as string[]}
              onChange={field.onChange}
              error={fieldErrors['roles']?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="branchIds"
          render={({ field }) => (
            <CheckboxGroup
              legend={requiresBranch(roles) ? 'Sedes en las que trabaja' : 'Sedes (opcional para administradores)'}
              idPrefix="sede"
              options={activeBranches.map((b) => ({
                value: b.id,
                label: b.name,
                ...(b.active ? {} : { hint: 'Sede inactiva' }),
              }))}
              value={field.value}
              onChange={field.onChange}
              error={fieldErrors['branchIds']?.message}
            />
          )}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </DialogFooter>
      </form>

      {editing && user.roles.includes('DENTIST') && (
        <ProfessionalSection
          user={user}
          onSaved={() => {
            void client.invalidateQueries({ queryKey: usersKey })
            void client.invalidateQueries({ queryKey: branchesKey })
          }}
        />
      )}
    </>
  )
}

const professionalSchema = z.object({
  licenseNumber: z.string().trim().min(1, 'Ingresá la matrícula'),
  specialty: z.string().trim().optional(),
})
type ProfessionalValues = z.infer<typeof professionalSchema>

function ProfessionalSection({ user, onSaved }: { user: User; onSaved: () => void }) {
  const [saved, setSaved] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfessionalValues>({
    resolver: zodResolver(professionalSchema),
    defaultValues: {
      licenseNumber: user.professional?.licenseNumber ?? '',
      specialty: user.professional?.specialty ?? '',
    },
  })

  const save = useMutation({
    mutationFn: (v: ProfessionalValues) =>
      api.put<Professional>(`/api/professionals/${user.id}`, {
        licenseNumber: v.licenseNumber,
        specialty: v.specialty ? v.specialty : null,
      }),
    onSuccess: () => {
      setSaved(true)
      onSaved()
    },
  })

  return (
    <section className="mt-6 border-t pt-4" aria-labelledby="perfil-profesional">
      <h3 id="perfil-profesional" className="mb-3 text-sm font-semibold">
        Perfil profesional
      </h3>
      <form
        onSubmit={handleSubmit((v) => {
          setSaved(false)
          save.mutate(v)
        })}
        className="space-y-3"
        noValidate
      >
        <FormError error={save.error} />
        {saved && <Alert variant="info">Perfil profesional guardado.</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Matrícula" htmlFor="licenseNumber" error={errors.licenseNumber?.message}>
            <Input id="licenseNumber" {...register('licenseNumber')} aria-invalid={!!errors.licenseNumber} />
          </Field>
          <Field label="Especialidad (opcional)" htmlFor="specialty">
            <Input id="specialty" {...register('specialty')} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" size="sm" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar perfil'}
          </Button>
        </div>
      </form>
    </section>
  )
}
