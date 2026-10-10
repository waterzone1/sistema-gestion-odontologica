'use client'

import { ArrowLeft, Pencil, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { PatientAppointments } from '@/components/appointments/patient-appointments'
import { AccountTab } from '@/components/billing/account-tab'
import { ServicesTab } from '@/components/billing/services-tab'
import { ClinicalHistory } from '@/components/clinical/clinical-history'
import { ClinicalProfileCard } from '@/components/clinical/clinical-profile-card'
import { FilesTab } from '@/components/clinical/files-tab'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs } from '@/components/ui/tabs'
import { useClinicalProfile } from '@/hooks/use-clinical'
import { usePatient } from '@/hooks/use-patients'
import { useSession } from '@/hooks/use-session'
import { ApiError } from '@/lib/api'
import { ageFrom, documentLabel, formatDate, fullName } from '@/lib/format'
import { can } from '@/lib/permissions'
import { ArchivePatientDialog } from '../archive-patient-dialog'
import { PatientFormDialog } from '@/components/patients/patient-form-dialog'

export default function PatientPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'patients:read')
  const canWrite = can(user, 'patients:write')
  const patient = usePatient(id)
  const clinicalProfile = useClinicalProfile(id, can(user, 'clinical:read'))

  const searchParams = useSearchParams()
  const [tab, setTab] = useState(() => searchParams.get('tab') ?? 'resumen')
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  if (!user || !allowed || patient.isPending) return <LoadingBlock />
  if (patient.error instanceof ApiError && patient.error.status === 404) {
    return <EmptyState title="El paciente no existe" description="El enlace es incorrecto o el paciente no está disponible." />
  }
  if (patient.isError) return <FormError error={patient.error} />

  const data = patient.data
  const tabs = [
    { id: 'resumen', label: 'Resumen' },
    ...(can(user, 'appointments:read') ? [{ id: 'turnos', label: 'Turnos' }] : []),
    ...(can(user, 'clinical:read') ? [{ id: 'historia', label: 'Historia clínica' }] : []),
    ...(can(user, 'clinical:read') ? [{ id: 'archivos', label: 'Archivos' }] : []),
    ...(can(user, 'services:read') ? [{ id: 'prestaciones', label: 'Prestaciones' }] : []),
    ...(can(user, 'account:read') ? [{ id: 'cuenta', label: 'Cuenta' }] : []),
  ]

  return (
    <>
      <Link href="/patients" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Pacientes
      </Link>

      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {fullName(data)}
            {data.archivedAt && <Badge variant="muted">Archivado</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[
              documentLabel(data),
              data.birthDate ? `${ageFrom(data.birthDate)} años` : null,
              data.phone,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {clinicalProfile.data?.current?.alerts && (
            <p
              role="note"
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-sm font-medium text-destructive"
            >
              <TriangleAlert className="size-4" aria-hidden />
              {clinicalProfile.data.current.alerts}
            </p>
          )}
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden />
              Editar
            </Button>
            <Button variant="outline" onClick={() => setArchiving(true)}>
              {data.archivedAt ? 'Reactivar' : 'Archivar'}
            </Button>
          </div>
        )}
      </header>

      <Tabs items={tabs} active={tab} onChange={setTab} label="Secciones de la ficha del paciente">
        {tab === 'turnos' && (
          <PatientAppointments
            patient={{ id: data.id, fullName: fullName(data), archived: data.archivedAt !== null }}
            user={user}
          />
        )}
        {tab === 'archivos' && (
          <FilesTab
            patientId={data.id}
            canWrite={can(user, 'clinical:write')}
            archivedPatient={data.archivedAt !== null}
          />
        )}
        {tab === 'historia' && (
          <div className="space-y-6">
            <ClinicalProfileCard patientId={data.id} canWrite={can(user, 'clinical:write') && data.archivedAt === null} />
            <ClinicalHistory
              patientId={data.id}
              userId={user.id}
              canWrite={can(user, 'clinical:write')}
              archived={data.archivedAt !== null}
            />
          </div>
        )}
        {tab === 'prestaciones' && (
          <ServicesTab
            patientId={data.id}
            canRecord={can(user, 'services:write')}
            canPrice={can(user, 'services:price')}
            archived={data.archivedAt !== null}
          />
        )}
        {tab === 'cuenta' && (
          <AccountTab patientId={data.id} canCollect={can(user, 'payments:create')} />
        )}
        {tab === 'resumen' && (
        <section aria-label="Datos administrativos" className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Datos administrativos</h2>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <Item label="Documento" value={documentLabel(data)} />
            <Item label="Fecha de nacimiento" value={data.birthDate ? formatDate(data.birthDate) : null} />
            <Item label="Teléfono" value={data.phone} />
            <Item label="Email" value={data.email} />
            <Item label="Dirección" value={data.address} />
            <Item label="Alta en el sistema" value={formatDate(data.createdAt)} />
          </dl>
        </section>
        )}
      </Tabs>

      <PatientFormDialog
        open={editing}
        onOpenChange={setEditing}
        patient={data}
        onSaved={() => setEditing(false)}
      />
      <ArchivePatientDialog patient={data} open={archiving} onOpenChange={setArchiving} />
    </>
  )
}

function Item({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value || '—'}</dd>
    </div>
  )
}
