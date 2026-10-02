'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState, LoadingBlock, PageHeader } from '@/components/page-header'
import { FormError } from '@/components/form-error'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useBranches, usersKey, useUsers } from '@/hooks/use-admin'
import { useSession } from '@/hooks/use-session'
import { api, errorMessage, type User } from '@/lib/api'
import { can, ROLE_LABELS } from '@/lib/permissions'
import { ResetPasswordDialog } from './reset-password-dialog'
import { UserFormDialog } from './user-form-dialog'

type Action =
  | { kind: 'create' }
  | { kind: 'edit'; user: User }
  | { kind: 'reset'; user: User }
  | { kind: 'deactivate'; user: User }
  | { kind: 'revoke'; user: User }

export default function UsersPage() {
  const router = useRouter()
  const client = useQueryClient()
  const session = useSession()
  const me = session.data?.user
  const allowed = can(me, 'users:manage')

  const users = useUsers(allowed)
  const branches = useBranches(allowed)
  const [action, setAction] = useState<Action | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (me && !allowed) router.replace('/dashboard')
  }, [me, allowed, router])

  const change = useMutation({
    mutationFn: ({ user, path }: { user: User; path: string }) => api.post(`/api/users/${user.id}/${path}`),
    onSuccess: async (_data, { path, user }) => {
      await client.invalidateQueries({ queryKey: usersKey })
      setNotice(
        path === 'activate'
          ? `${user.displayName} fue reactivado.`
          : path === 'deactivate'
            ? `${user.displayName} fue dado de baja y se cerraron sus sesiones.`
            : `Se cerraron las sesiones de ${user.displayName}.`,
      )
      setAction(null)
    },
  })

  if (!me || !allowed) return <LoadingBlock />
  if (users.isPending || branches.isPending) return <LoadingBlock />
  if (users.isError || branches.isError) {
    return <FormError error={users.error ?? branches.error} />
  }

  const branchName = new Map(branches.data.map((b) => [b.id, b.name]))
  const close = () => {
    setAction(null)
    change.reset()
  }

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Personas con acceso al sistema, sus roles y las sedes en las que trabajan."
        actions={
          <Button onClick={() => setAction({ kind: 'create' })}>
            <Plus className="size-4" aria-hidden />
            Nuevo usuario
          </Button>
        }
      />

      {notice && (
        <Alert variant="info" className="mb-4">
          {notice}
        </Alert>
      )}

      {users.data.length === 0 ? (
        <EmptyState title="Todavía no hay usuarios" description="Creá el primero con el botón «Nuevo usuario»." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Nombre</th>
                <th scope="col" className="px-4 py-2 font-medium">Roles</th>
                <th scope="col" className="px-4 py-2 font-medium">Sedes</th>
                <th scope="col" className="px-4 py-2 font-medium">Estado</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.data.map((user) => {
                const isMe = user.id === me.id
                return (
                  <tr key={user.id} className={user.active ? undefined : 'text-muted-foreground'}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{user.displayName}</p>
                      <p className="text-xs text-muted-foreground">@{user.username}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <Badge key={role}>{ROLE_LABELS[role]}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {user.branchIds.map((id) => branchName.get(id) ?? '—').join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {user.active ? (
                        <Badge variant="success">Activo</Badge>
                      ) : (
                        <Badge variant="muted">De baja</Badge>
                      )}
                      {user.mustChangePassword && user.active && (
                        <p className="mt-1 text-xs text-muted-foreground">Clave temporal</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setAction({ kind: 'edit', user })}>
                          Editar
                        </Button>
                        {user.active && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setAction({ kind: 'reset', user })}>
                              Restablecer clave
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setAction({ kind: 'revoke', user })}>
                              Cerrar sesiones
                            </Button>
                            {!isMe && (
                              <Button size="sm" variant="outline" onClick={() => setAction({ kind: 'deactivate', user })}>
                                Dar de baja
                              </Button>
                            )}
                          </>
                        )}
                        {!user.active && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => change.mutate({ user, path: 'activate' })}
                            disabled={change.isPending}
                          >
                            Reactivar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <UserFormDialog
        open={action?.kind === 'create' || action?.kind === 'edit'}
        onOpenChange={(open) => !open && close()}
        user={action?.kind === 'edit' ? action.user : null}
        branches={branches.data}
        onSaved={setNotice}
      />
      <ResetPasswordDialog
        user={action?.kind === 'reset' ? action.user : null}
        onOpenChange={(open) => !open && close()}
        onDone={setNotice}
      />
      <ConfirmDialog
        open={action?.kind === 'deactivate'}
        onOpenChange={(open) => !open && close()}
        title={action?.kind === 'deactivate' ? `Dar de baja a ${action.user.displayName}` : ''}
        description="Pierde el acceso de inmediato y se cierran todas sus sesiones. Sus datos se conservan y se puede reactivar."
        confirmLabel="Dar de baja"
        pending={change.isPending}
        error={errorMessage(change.error) ?? undefined}
        onConfirm={() => action?.kind === 'deactivate' && change.mutate({ user: action.user, path: 'deactivate' })}
      />
      <ConfirmDialog
        open={action?.kind === 'revoke'}
        onOpenChange={(open) => !open && close()}
        title={action?.kind === 'revoke' ? `Cerrar las sesiones de ${action.user.displayName}` : ''}
        description="La persona tendrá que volver a iniciar sesión en todos sus dispositivos."
        confirmLabel="Cerrar sesiones"
        pending={change.isPending}
        error={errorMessage(change.error) ?? undefined}
        onConfirm={() => action?.kind === 'revoke' && change.mutate({ user: action.user, path: 'revoke-sessions' })}
      />
    </>
  )
}
