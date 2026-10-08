'use client'

import Link from 'next/link'
import { FormError } from '@/components/form-error'
import { useDebtors } from '@/hooks/use-billing'
import { formatMoney } from '@/lib/format'

export function Debtors() {
  const debtors = useDebtors(true)

  return (
    <section aria-labelledby="saldos-pendientes" className="mt-6 rounded-lg border bg-card p-5 shadow-sm">
      <h2 id="saldos-pendientes" className="mb-3 text-sm font-semibold">
        Saldos pendientes
      </h2>
      <FormError error={debtors.error} />
      {debtors.isPending && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {debtors.data && debtors.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay pacientes con saldo a cobrar.</p>
      )}
      {debtors.data && debtors.data.length > 0 && (
        <ul className="divide-y">
          {debtors.data.map((debtor) => (
            <li key={debtor.patientId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <Link href={`/patients/${debtor.patientId}`} className="text-primary hover:underline">
                {debtor.fullName}
              </Link>
              <span className="font-medium">{formatMoney(debtor.balance)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
