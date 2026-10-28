'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { PendingBilling } from '@/components/billing/pending-billing'
import { Figure } from '@/components/billing/figure'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCashDay } from '@/hooks/use-billing'
import { useSession } from '@/hooks/use-session'
import type { CashDay } from '@/lib/api'
import { PaymentAmount } from '@/components/billing/payment-amount'
import { CURRENCY_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/billing'
import { formatDate, formatMoney, formatTime, parseDateText, shiftIsoDay, toIsoDay } from '@/lib/format'
import { can } from '@/lib/permissions'
import { DateInput } from '@/components/ui/date-input'

export default function CashPage() {
  const router = useRouter()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'account:read')
  const today = toIsoDay(new Date())
  const [day, setDay] = useState(today)
  const [jumpTo, setJumpTo] = useState('')
  const cash = useCashDay(day)

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  if (!user || !allowed) return <LoadingBlock />

  const go = (target: string) => setDay(target > today ? today : target)

  return (
    <>
      <PageHeader title="Caja" description="Cobros del día por medio de pago y moneda. Lo anulado se muestra pero no suma." />

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center" data-tour="cash-day">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" aria-label="Día anterior" onClick={() => go(shiftIsoDay(day, -1))}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="min-w-28 text-center text-sm font-semibold">{day === today ? 'Hoy' : formatDate(day)}</span>
          <Button
            variant="outline"
            size="sm"
            aria-label="Día siguiente"
            disabled={day >= today}
            onClick={() => go(shiftIsoDay(day, 1))}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const parsed = parseDateText(jumpTo)
            if (parsed) go(parsed)
          }}
        >
          <DateInput
            aria-label="Ir a la fecha"
            className="w-32"
            value={jumpTo}
            onChange={(event) => setJumpTo(event.target.value)}
 />
          <Button type="submit" variant="outline" size="sm" disabled={!parseDateText(jumpTo)}>
            Ver
          </Button>
        </form>
        {day !== today && (
          <Button variant="outline" size="sm" onClick={() => setDay(today)}>
            Volver a hoy
          </Button>
        )}
      </div>

      <FormError error={cash.error} />
      {cash.isPending ? <LoadingBlock /> : cash.data && <CashSummary data={cash.data} />}

      {can(user, 'services:write') && <PendingBilling />}
    </>
  )
}

function CashSummary({ data }: { data: CashDay }) {
  const dollars = data.byCurrency.find((c) => c.currency === 'USD')
  return (
    <div className="space-y-6">
      <section aria-label="Totales del día" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Total cobrado en pesos" value={formatMoney(data.totalArs)} emphasis />
        <Figure
          label="En dólares"
          value={dollars ? formatMoney(dollars.originalTotal, 'USD') : formatMoney('0', 'USD')}
          hint={dollars ? `Equivale a ${formatMoney(dollars.amountTotal)}` : undefined}
 />
        <Figure label="Saldo a favor aplicado" value={formatMoney(data.creditTotal)} hint="No es plata que entra" />
        <Figure label="Anulados" value={String(data.voidedCount)} />
      </section>

      {data.totals.length > 0 && (
        <section aria-label="Por medio de pago">
          <h2 className="mb-2 text-sm font-semibold">Por medio de pago</h2>
          <ul className="divide-y rounded-lg border bg-card text-sm shadow-sm">
            {data.totals.map((total) => (
              <li key={`${total.method}-${total.currency}`} className="flex items-center justify-between gap-3 px-4 py-2">
                <span>
                  {PAYMENT_METHOD_LABELS[total.method]} en {CURRENCY_LABELS[total.currency].toLowerCase()}
                  <span className="text-xs text-muted-foreground"> · {total.count} cobro{total.count === 1 ? '' : 's'}</span>
                </span>
                <span className="text-right font-medium">
                  {formatMoney(total.originalTotal, total.currency)}
                  {total.currency !== 'ARS' && (
                    <span className="block text-xs font-normal text-muted-foreground">{formatMoney(total.amountTotal)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Movimientos">
        <h2 className="mb-2 text-sm font-semibold">Movimientos</h2>
        {data.movements.length === 0 ? (
          <EmptyState title="No hubo cobros este día" />
        ) : (
          <ul className="divide-y rounded-lg border bg-card shadow-sm">
            {data.movements.map((movement) => (
              <li
                key={movement.id}
                className="flex flex-col gap-1 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className={movement.status === 'VOIDED' ? 'min-w-0 text-muted-foreground line-through' : 'min-w-0'}>
                  <span className="font-medium">{formatTime(movement.receivedAt)}</span>{' '}
                  <Link href={`/patients/${movement.patient.id}?tab=cuenta`} className="text-primary hover:underline">
                    {movement.patient.fullName}
                  </Link>{' '}
                  · {PAYMENT_METHOD_LABELS[movement.method]}
                  {movement.externalReference && ` · ${movement.externalReference}`}
                  <span className="text-xs text-muted-foreground"> · {movement.createdBy}</span>
                  {movement.status === 'VOIDED' && movement.voidReason && (
                    <span className="block text-xs no-underline">Anulado: {movement.voidReason}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {movement.status === 'VOIDED' && <Badge variant="destructive">Anulado</Badge>}
                  {movement.kind === 'CREDIT' && <Badge variant="muted">No suma</Badge>}
                  <span className="font-medium">
                    <PaymentAmount payment={movement} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
