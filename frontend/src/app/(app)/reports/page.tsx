'use client'

import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock, PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/input'
import { Tabs } from '@/components/ui/tabs'
import { useBranches } from '@/hooks/use-admin'
import { useProfessionals } from '@/hooks/use-catalog'
import { useSession } from '@/hooks/use-session'
import { api, type Debtor } from '@/lib/api'
import type { components } from '@/lib/api-types'
import { CURRENCY_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/billing'
import { csvAmount, downloadCsv } from '@/lib/csv'
import { formatDate, formatMoney, parseDateText, toDateText } from '@/lib/format'
import { can } from '@/lib/permissions'
import { DateInput } from '@/components/ui/date-input'

type Schemas = components['schemas']

interface Filters {
  from: string
  to: string
  branchId: string
  professionalId: string
}

function useReport<T>(kind: string, filters: Filters | null) {
  const params = new URLSearchParams()
  if (filters) {
    params.set('from', filters.from)
    params.set('to', filters.to)
    if (filters.branchId) params.set('branchId', filters.branchId)
    if (filters.professionalId) params.set('professionalId', filters.professionalId)
  }
  return useQuery({
    queryKey: ['reports', kind, params.toString()],
    queryFn: () => api.get<T>(`/api/reports/${kind}?${params.toString()}`),
    enabled: filters !== null,
  })
}

export default function ReportsPage() {
  const router = useRouter()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'reports:read')
  const branches = useBranches()
  const professionals = useProfessionals(allowed)
  const today = new Date()
  const [draft, setDraft] = useState({
    from: toDateText(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: toDateText(today),
    branchId: '',
    professionalId: '',
  })
  const [tab, setTab] = useState('turnos')
  const toFilters = (value: typeof draft): Filters | null => {
    const from = parseDateText(value.from)
    const to = parseDateText(value.to)
    return from && to ? { from, to, branchId: value.branchId, professionalId: value.professionalId } : null
  }
  const [filters, setFilters] = useState<Filters | null>(() => toFilters(draft))

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  if (!user || !allowed) return <LoadingBlock />

  return (
    <>
      <PageHeader title="Reportes" description="Turnos, cobranzas, prestaciones y saldos del período. Cada tabla se puede exportar a CSV." />
      <form
        data-tour="reports-filters"
        className="mb-4 grid gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          setFilters(toFilters(draft))
        }}
      >
        <Field label="Desde" htmlFor="report-from">
          <DateInput id="report-from" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </Field>
        <Field label="Hasta" htmlFor="report-to">
          <DateInput id="report-to" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </Field>
        <Field label="Sede" htmlFor="report-branch">
          <Select id="report-branch" value={draft.branchId} onChange={(e) => setDraft({ ...draft, branchId: e.target.value })}>
            <option value="">Todas</option>
            {(branches.data ?? []).map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Profesional" htmlFor="report-professional">
          <Select id="report-professional" value={draft.professionalId} onChange={(e) => setDraft({ ...draft, professionalId: e.target.value })}>
            <option value="">Todos</option>
            {(professionals.data ?? []).map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="outline" disabled={!toFilters(draft)}>
          Ver
        </Button>
      </form>

      <Tabs
        anchor="reports-tabs"
        items={[
          { id: 'turnos', label: 'Turnos' },
          { id: 'cobranzas', label: 'Cobranzas' },
          { id: 'prestaciones', label: 'Prestaciones' },
          { id: 'saldos', label: 'Saldos pendientes' },
        ]}
        active={tab}
        onChange={setTab}
        label="Reportes"
      >
        {tab === 'turnos' && <AppointmentsReport filters={filters} />}
        {tab === 'cobranzas' && <CollectionsReport filters={filters} />}
        {tab === 'prestaciones' && <ServicesReport filters={filters} />}
        {tab === 'saldos' && <DebtorsReport />}
      </Tabs>
    </>
  )
}

type Cell = string | number | { view: ReactNode; csv: string | number }

const csvOf = (cell: Cell) => (typeof cell === 'object' ? cell.csv : cell)
const viewOf = (cell: Cell) => (typeof cell === 'object' ? cell.view : cell)
const money = (amount: string, currency: 'ARS' | 'USD' = 'ARS'): Cell => ({ view: formatMoney(amount, currency), csv: csvAmount(amount) })

function Table({ head, rows, file }: { head: string[]; rows: Cell[][]; file: string }) {
  if (rows.length === 0) return <EmptyState title="No hay datos en el período" />
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => downloadCsv(file, [head, ...rows.map((row) => row.map(csvOf))])}>
          <Download className="size-4" aria-hidden />
          Exportar CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {head.map((title) => (
                <th key={title} scope="col" className="px-3 py-2 font-medium">
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((value, column) => (
                  <td key={column} className="px-3 py-2">
                    {viewOf(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const percent = (part: number, total: number) => (total === 0 ? '—' : `${Math.round((part / total) * 100)} %`)

function AppointmentsReport({ filters }: { filters: Filters | null }) {
  const report = useReport<Schemas['AppointmentsReport']>('appointments', filters)
  if (report.isPending) return <LoadingBlock />
  if (report.isError) return <FormError error={report.error} />
  const { totals, byProfessional } = report.data
  const rows = [...byProfessional.map((r) => ({ name: r.professional.displayName, ...r })), { name: 'Total', ...totals }]
  return (
    <Table
      file="reporte-turnos.csv"
      head={['Profesional', 'Turnos', 'Atendidos', 'Ausentes', 'Cancelados', 'Ausentismo']}
      rows={rows.map((r) => [r.name, r.total, r.attended, r.noShow, r.cancelled, percent(r.noShow, r.total - r.cancelled)])}
 />
  )
}

function CollectionsReport({ filters }: { filters: Filters | null }) {
  const report = useReport<Schemas['CollectionsReport']>('collections', filters)
  if (report.isPending) return <LoadingBlock />
  if (report.isError) return <FormError error={report.error} />
  const { totalArs, byDay, byMethod } = report.data
  return (
    <div className="space-y-6">
      <p className="text-sm">
        Total cobrado en el período: <span className="font-semibold">{formatMoney(totalArs)}</span>
      </p>
      <Table
        file="reporte-cobranzas-por-medio.csv"
        head={['Medio', 'Moneda', 'Cobros', 'Importe', 'En pesos']}
        rows={byMethod.map((m) => [
          PAYMENT_METHOD_LABELS[m.method],
          CURRENCY_LABELS[m.currency],
          m.count,
          money(m.originalTotal, m.currency),
          money(m.amountArs),
        ])}
 />
      <Table
        file="reporte-cobranzas-por-dia.csv"
        head={['Día', 'Cobros', 'En pesos']}
        rows={byDay.map((d) => [formatDate(d.date), d.count, money(d.amountArs)])}
 />
    </div>
  )
}

function ServicesReport({ filters }: { filters: Filters | null }) {
  const report = useReport<Schemas['ServicesReport']>('services', filters)
  if (report.isPending) return <LoadingBlock />
  if (report.isError) return <FormError error={report.error} />
  const { byProfessional, byPractice } = report.data
  const section = (title: string, file: string, rows: { name: string; count: number; patientAmount: string; coverageAmount: string }[]) => (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Table
        file={file}
        head={[title, 'Prestaciones', 'A cargo de pacientes', 'A cargo de coberturas']}
        rows={rows.map((r) => [r.name, r.count, money(r.patientAmount), money(r.coverageAmount)])}
 />
    </section>
  )
  return (
    <div className="space-y-6">
      {section('Profesional', 'reporte-prestaciones-por-profesional.csv', byProfessional.map((r) => ({ ...r, name: r.professional.displayName })))}
      {section('Práctica', 'reporte-prestaciones-por-practica.csv', byPractice.map((r) => ({ ...r, name: r.practice.name })))}
    </div>
  )
}

function DebtorsReport() {
  const debtors = useQuery({ queryKey: ['reports', 'debtors'], queryFn: () => api.get<Debtor[]>('/api/reports/debtors') })
  if (debtors.isPending) return <LoadingBlock />
  if (debtors.isError) return <FormError error={debtors.error} />
  return (
    <Table
      file="reporte-saldos.csv"
      head={['Paciente', 'Saldo a cobrar']}
      rows={debtors.data.map((d) => [
        {
          view: (
            <Link href={`/patients/${d.patientId}?tab=cuenta`} className="text-primary hover:underline">
              {d.fullName}
            </Link>
          ),
          csv: d.fullName,
        },
        money(d.balance),
      ])}
 />
  )
}
