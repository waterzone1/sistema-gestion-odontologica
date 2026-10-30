'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock, PageHeader } from '@/components/page-header'
import { Pagination } from '@/components/pagination'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/input'
import { useSession } from '@/hooks/use-session'
import { api, type AuditList } from '@/lib/api'
import { AUDIT_ACTION_LABELS, auditActionLabel, auditDetails } from '@/lib/audit'
import { formatDateTime, parseDateText } from '@/lib/format'
import { can } from '@/lib/permissions'
import { DateInput } from '@/components/ui/date-input'

const PAGE_SIZE = 50

interface Filters {
  from: string
  to: string
  action: string
}

export default function AuditPage() {
  const router = useRouter()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'audit:read')
  const [draft, setDraft] = useState<Filters>({ from: '', to: '', action: '' })
  const [filters, setFilters] = useState<Filters>(draft)
  const [page, setPage] = useState(1)

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
  const from = parseDateText(filters.from)
  const to = parseDateText(filters.to)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (filters.action) params.set('action', filters.action)
  const audit = useQuery({
    queryKey: ['audit', params.toString()],
    queryFn: () => api.get<AuditList>(`/api/audit?${params.toString()}`),
    enabled: allowed,
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  if (!user || !allowed) return <LoadingBlock />

  const totalPages = audit.data ? Math.max(1, Math.ceil(audit.data.total / PAGE_SIZE)) : 1

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Quién hizo qué, a quién y cuándo. Nunca se guardan contraseñas ni contenido clínico."
 />
      <form
        data-tour="audit-filters"
        className="mb-4 grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          setFilters(draft)
          setPage(1)
        }}
      >
        <Field label="Desde" htmlFor="audit-from">
          <DateInput id="audit-from" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </Field>
        <Field label="Hasta" htmlFor="audit-to">
          <DateInput id="audit-to" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </Field>
        <Field label="Acción" htmlFor="audit-action">
          <Select id="audit-action" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })}>
            <option value="">Todas</option>
            {Object.entries(AUDIT_ACTION_LABELS)
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </Select>
        </Field>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>
      <FormError error={audit.error} className="mb-4" />
      {audit.isPending ? (
        <LoadingBlock />
      ) : audit.data && audit.data.items.length === 0 ? (
        <EmptyState title="No hay eventos con esos filtros" />
      ) : (
        <ul className="divide-y rounded-lg border bg-card shadow-sm" data-tour="audit-list">
          {(audit.data?.items ?? []).map((item) => {
            const details = auditDetails(item.metadata)
            return (
              <li key={item.id} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                <div className="min-w-0">
                  <p>
                    <span className="font-medium">{auditActionLabel(item.action)}</span>
                    {item.subject && <span> · {item.subject}</span>}
                  </p>
                  {details.length > 0 && <p className="text-xs text-muted-foreground">{details.join(' · ')}</p>}
                </div>
                <p className="text-xs text-muted-foreground sm:text-right">
                  <span className="block font-medium text-foreground">{item.actor?.displayName ?? 'Sistema'}</span>
                  {formatDateTime(item.createdAt)}
                </p>
              </li>
            )
          })}
        </ul>
      )}
      {audit.data && totalPages > 1 && (
        <Pagination
          label="Paginación de auditoría"
          page={page}
          totalPages={totalPages}
          summary={`${audit.data.total} eventos`}
          onChange={setPage}
 />
      )}
    </>
  )
}
