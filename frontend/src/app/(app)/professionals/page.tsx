'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { useBranches } from '@/hooks/use-admin'
import { useProfessionals } from '@/hooks/use-catalog'
import { useSession } from '@/hooks/use-session'
import { can } from '@/lib/permissions'

export default function ProfessionalsPage() {
  const router = useRouter()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'availability:manage')
  const professionals = useProfessionals(allowed)
  const branches = useBranches(allowed)

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  if (!user || !allowed || professionals.isPending) return <LoadingBlock />
  if (professionals.isError) return <FormError error={professionals.error} />

  const branchName = new Map((branches.data ?? []).map((b) => [b.id, b.name]))

  return (
    <>
      <PageHeader
        title="Profesionales"
        description="Datos, prácticas que realiza, horarios de atención y excepciones (vacaciones, ausencias, bloqueos)."
      />
      {professionals.data.length === 0 ? (
        <EmptyState
          title="Todavía no hay profesionales"
          description="Se dan de alta desde Usuarios, con el rol Odontólogo y su matrícula."
        />
      ) : (
        <ul className="divide-y rounded-lg border bg-card shadow-sm">
          {professionals.data.map((professional) => (
            <li key={professional.id}>
              <Link
                href={`/professionals/${professional.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 text-sm">
                  <span className="font-medium">{professional.displayName}</span>
                  <span className="block text-xs text-muted-foreground">
                    Matrícula {professional.licenseNumber}
                    {' · '}
                    {professional.branchIds.map((id) => branchName.get(id) ?? '').filter(Boolean).join(', ') || 'Sin sedes'}
                  </span>
                </span>
                <Badge variant={professional.active ? 'success' : 'muted'} className="self-start sm:self-auto">
                  {professional.active ? 'Activo' : 'Inactivo'}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
