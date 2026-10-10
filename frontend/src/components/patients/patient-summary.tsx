'use client'

import { useState, type ReactNode } from 'react'
import { useAppointments } from '@/hooks/use-appointments'
import { useAccount, useServices } from '@/hooks/use-billing'
import { useClinicalEntries } from '@/hooks/use-clinical'
import type { Patient, SessionUser } from '@/lib/api'
import { documentLabel, formatDate, formatDateTime, formatMoney } from '@/lib/format'
import { can } from '@/lib/permissions'

const YEAR_MS = 366 * 24 * 60 * 60 * 1000

interface Props {
  patient: Patient
  user: SessionUser
}

export function PatientSummary({ patient, user }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {can(user, 'appointments:read') && <NextAppointment patientId={patient.id} />}
      {can(user, 'account:read') && <Balance patientId={patient.id} />}
      {can(user, 'clinical:read') && <LastEvolution patientId={patient.id} />}
      {can(user, 'services:read') && <LastServices patientId={patient.id} />}
      <Card title="Datos administrativos" wide>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Item label="Documento" value={documentLabel(patient)} />
          <Item label="Fecha de nacimiento" value={patient.birthDate ? formatDate(patient.birthDate) : null} />
          <Item label="Teléfono" value={patient.phone} />
          <Item label="Email" value={patient.email} />
          <Item label="Dirección" value={patient.address} />
          <Item label="Alta en el sistema" value={formatDate(patient.createdAt)} />
        </dl>
      </Card>
    </div>
  )
}

function Card({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section aria-label={title} className={`rounded-lg border bg-card p-5 shadow-sm ${wide ? 'sm:col-span-2' : ''}`}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
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

function NextAppointment({ patientId }: { patientId: string }) {
  const [range] = useState(() => {
    const now = Date.now()
    return { from: new Date(now).toISOString(), to: new Date(now + YEAR_MS).toISOString() }
  })
  const appointments = useAppointments({ ...range, patientId })
  const next = (appointments.data ?? []).find((a) => a.status === 'SCHEDULED' || a.status === 'CONFIRMED')
  return (
    <Card title="Próximo turno">
      <p className="text-sm">
        {appointments.isPending
          ? 'Cargando…'
          : next
            ? `${formatDateTime(next.startsAt)} · ${next.professional.displayName}${next.practice ? ` · ${next.practice.name}` : ''}`
            : 'No tiene turnos próximos.'}
      </p>
    </Card>
  )
}

function Balance({ patientId }: { patientId: string }) {
  const account = useAccount(patientId)
  return (
    <Card title="Cuenta">
      {account.data ? (
        <p className="text-sm">
          Saldo a cobrar <span className="font-semibold">{formatMoney(account.data.balance)}</span>
          {Number(account.data.availableCredit) > 0 && ` · Saldo a favor ${formatMoney(account.data.availableCredit)}`}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      )}
    </Card>
  )
}

function LastEvolution({ patientId }: { patientId: string }) {
  const entries = useClinicalEntries(patientId)
  const last = entries.data?.[0]
  return (
    <Card title="Última evolución clínica">
      {last ? (
        <p className="text-sm">
          <span className="line-clamp-3 whitespace-pre-wrap">{last.content}</span>
          <span className="block text-xs text-muted-foreground">
            {formatDateTime(last.createdAt)} · {last.professional.displayName}
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{entries.isPending ? 'Cargando…' : 'Sin notas todavía.'}</p>
      )}
    </Card>
  )
}

function LastServices({ patientId }: { patientId: string }) {
  const services = useServices(patientId)
  const recent = (services.data ?? []).filter((s) => s.status === 'ACTIVE').slice(0, 3)
  return (
    <Card title="Últimas prestaciones">
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">{services.isPending ? 'Cargando…' : 'Sin prestaciones todavía.'}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {recent.map((service) => (
            <li key={service.id}>
              {service.practice.name}
              <span className="text-xs text-muted-foreground"> · {formatDate(service.performedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
