'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs'
import { useBranches } from '@/hooks/use-admin'
import { useProfessionals } from '@/hooks/use-catalog'
import { useSession } from '@/hooks/use-session'
import { can } from '@/lib/permissions'
import { ExceptionsPanel } from './exceptions-panel'
import { PracticesForm } from './practices-form'
import { ProfileForm } from './profile-form'
import { ScheduleEditor } from './schedule-editor'

export default function ProfessionalPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'availability:manage')
  const canManage = can(user, 'professionals:manage')
  const professionals = useProfessionals(allowed)
  const branches = useBranches(allowed)
  const [tab, setTab] = useState('horarios')

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  if (!user || !allowed || professionals.isPending || branches.isPending) return <LoadingBlock />
  if (professionals.isError) return <FormError error={professionals.error} />

  const professional = professionals.data.find((p) => p.id === id)
  if (!professional) {
    return <EmptyState title="El profesional no existe" description="El enlace es incorrecto o el perfil no está disponible." />
  }
  const professionalBranches = (branches.data ?? []).filter((b) => professional.branchIds.includes(b.id))

  return (
    <>
      <Link href="/professionals" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Profesionales
      </Link>
      <header className="mb-6 space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          {professional.displayName}
          {!professional.active && <Badge variant="muted">Inactivo</Badge>}
        </h1>
        <p className="text-sm text-muted-foreground">
          Matrícula {professional.licenseNumber} · {professionalBranches.map((b) => b.name).join(', ') || 'Sin sedes'}
        </p>
      </header>

      <Tabs
        items={[
          { id: 'horarios', label: 'Horarios' },
          { id: 'excepciones', label: 'Excepciones' },
          { id: 'practicas', label: 'Prácticas' },
          { id: 'datos', label: 'Datos' },
        ]}
        active={tab}
        onChange={setTab}
        label="Secciones del profesional"
      >
        {tab === 'horarios' && (
          <ScheduleEditor professionalId={professional.id} branches={professionalBranches} editable={canManage} />
        )}
        {tab === 'excepciones' && <ExceptionsPanel professionalId={professional.id} branches={professionalBranches} />}
        {tab === 'practicas' && <PracticesForm professional={professional} editable={canManage} />}
        {tab === 'datos' && <ProfileForm professional={professional} editable={canManage} />}
      </Tabs>
    </>
  )
}
