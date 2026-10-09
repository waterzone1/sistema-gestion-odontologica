'use client'

import { Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FormError } from '@/components/form-error'
import { Pagination } from '@/components/pagination'
import { EmptyState, LoadingBlock, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { usePatients } from '@/hooks/use-patients'
import { useSession } from '@/hooks/use-session'
import { ageFrom, documentLabel, fullName } from '@/lib/format'
import { can } from '@/lib/permissions'
import { PatientFormDialog } from './patient-form-dialog'

type Status = 'active' | 'archived' | 'all'

export default function PatientsPage() {
  const router = useRouter()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'patients:read')
  const canWrite = can(user, 'patients:write')

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<Status>('active')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const q = useDebouncedValue(search.trim(), 300)
  const patients = usePatients({ q, status, page })

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  if (!user || !allowed) return <LoadingBlock />

  const totalPages = patients.data ? Math.max(1, Math.ceil(patients.data.total / patients.data.pageSize)) : 1

  return (
    <>
      <PageHeader
        title="Pacientes"
        description="Buscá por apellido, nombre, documento o teléfono."
        actions={
          canWrite && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden />
              Nuevo paciente
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Buscar paciente"
            placeholder="Ej.: gomez, 30123456, 1155551234"
            className="pl-9"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          aria-label="Estado"
          className="sm:w-44"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as Status)
            setPage(1)
          }}
        >
          <option value="active">Activos</option>
          <option value="archived">Archivados</option>
          <option value="all">Todos</option>
        </Select>
      </div>

      {patients.isError && <FormError error={patients.error} />}
      {patients.isPending && <LoadingBlock />}

      {patients.data && patients.data.items.length === 0 && (
        <EmptyState
          title={q ? `No se encontraron pacientes para «${q}»` : 'Todavía no hay pacientes'}
          description={canWrite ? 'Podés crear uno con el botón «Nuevo paciente».' : undefined}
        />
      )}

      {patients.data && patients.data.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Paciente</th>
                  <th scope="col" className="px-4 py-2 font-medium">Documento</th>
                  <th scope="col" className="px-4 py-2 font-medium">Teléfono</th>
                  <th scope="col" className="px-4 py-2 font-medium">Edad</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {patients.data.items.map((patient) => (
                  <tr key={patient.id} className={patient.archivedAt ? 'text-muted-foreground' : undefined}>
                    <td className="px-4 py-3">
                      <Link href={`/patients/${patient.id}`} className="font-medium text-primary hover:underline">
                        {fullName(patient)}
                      </Link>
                      {patient.archivedAt && <Badge variant="muted" className="ml-2">Archivado</Badge>}
                    </td>
                    <td className="px-4 py-3">{documentLabel(patient)}</td>
                    <td className="px-4 py-3">{patient.phone ?? '—'}</td>
                    <td className="px-4 py-3">{patient.birthDate ? `${ageFrom(patient.birthDate)} años` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            summary={`${patients.data.total} ${patients.data.total === 1 ? 'paciente' : 'pacientes'}`}
            onChange={setPage}
          />
        </>
      )}

      <PatientFormDialog
        open={creating}
        onOpenChange={setCreating}
        patient={null}
        onSaved={(patient) => router.push(`/patients/${patient.id}`)}
      />
    </>
  )
}
