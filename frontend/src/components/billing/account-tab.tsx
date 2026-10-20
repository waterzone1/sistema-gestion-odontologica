'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { ReasonDialog } from '@/components/billing/reason-dialog'
import { ChargeForm } from '@/components/billing/charge-form'
import { Figure } from '@/components/billing/figure'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock } from '@/components/page-header'
import { Pagination, usePagedList } from '@/components/pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAccount, useVoid } from '@/hooks/use-billing'
import type { Payment } from '@/lib/api'
import { PAYMENT_METHOD_LABELS, paymentAmountText } from '@/lib/billing'
import { formatDateTime, formatMoney } from '@/lib/format'

interface Props {
  patientId: string
  canCollect: boolean
}

export function AccountTab({ patientId, canCollect }: Props) {
  const account = useAccount(patientId)
  const [collecting, setCollecting] = useState(false)
  const [voiding, setVoiding] = useState<Payment | null>(null)
  const voidPayment = useVoid(patientId, 'payments')
  const voidCredit = useVoid(patientId, 'credits')
  const voidAction = voiding?.method === 'CREDIT' ? voidCredit : voidPayment
  const paged = usePagedList(account.data?.payments ?? [])

  if (account.isPending) return <LoadingBlock />
  if (account.isError) return <FormError error={account.error} />

  const { balance, totalServices, totalPayments, availableCredit, payments } = account.data

  return (
    <div className="space-y-6">
      <section aria-label="Resumen de cuenta" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Prestaciones" value={formatMoney(totalServices)} />
        <Figure label="Pagos" value={formatMoney(totalPayments)} />
        <Figure label="Saldo a cobrar" value={formatMoney(balance)} emphasis={Number(balance) > 0} />
        <Figure label="Saldo a favor" value={formatMoney(availableCredit)} />
      </section>

      {canCollect && (
        <div className="flex justify-end">
          <Button onClick={() => setCollecting(true)}>
            <Plus className="size-4" aria-hidden />
            Registrar pago
          </Button>
        </div>
      )}

      <section aria-label="Pagos">
        <h2 className="mb-2 text-sm font-semibold">Pagos</h2>
        {payments.length === 0 ? (
          <EmptyState title="Todavía no registró pagos" />
        ) : (
          <ul className="divide-y rounded-lg border bg-card shadow-sm">
            {paged.items.map((payment) => (
              <li key={payment.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {paymentAmountText(payment)} · {PAYMENT_METHOD_LABELS[payment.method]}
                    {payment.externalReference && ` · ${payment.externalReference}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(payment.receivedAt)} · {payment.createdBy}
                  </p>
                  {payment.status === 'ACTIVE' && Number(payment.unallocated) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(payment.unallocated)} quedan como saldo a favor
                    </p>
                  )}
                  {payment.status === 'VOIDED' && (
                    <p className="text-xs text-muted-foreground">Motivo de la anulación: {payment.voidReason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {payment.status === 'VOIDED' ? (
                    <Badge variant="destructive">Anulado</Badge>
                  ) : (
                    payment.voidable && (
                      <Button variant="outline" size="sm" onClick={() => setVoiding(payment)}>
                        Anular
                      </Button>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {paged.totalPages > 1 && (
          <Pagination
            label="Paginación de pagos"
            page={paged.page}
            totalPages={paged.totalPages}
            summary={`${payments.length} movimientos`}
            onChange={paged.setPage}
          />
        )}
      </section>

      <Dialog open={collecting} onOpenChange={setCollecting}>
        {collecting && (
          <DialogContent
            title="Registrar pago"
            description="Podés combinar medios de pago. Se aplica a las prestaciones más antiguas, salvo que elijas cuáles cubrir."
            className="max-w-xl"
          >
            <ChargeForm patientId={patientId} account={account.data} onClose={() => setCollecting(false)} />
          </DialogContent>
        )}
      </Dialog>
      <ReasonDialog
        key={voiding?.id}
        open={voiding !== null}
        onOpenChange={(open) => !open && setVoiding(null)}
        title={voiding?.method === 'CREDIT' ? 'Anular uso de saldo a favor' : 'Anular pago'}
        description={
          voiding?.method === 'CREDIT'
            ? 'El saldo a favor vuelve a quedar disponible y la prestación vuelve a quedar pendiente.'
            : 'El pago se conserva marcado como anulado y deja de contar en el saldo.'
        }
        confirmLabel="Anular"
        pending={voidAction.isPending}
        error={voidAction.error}
        onConfirm={(reason) =>
          voiding && voidAction.mutate({ id: voiding.id, reason }, { onSuccess: () => setVoiding(null) })
        }
      />
    </div>
  )
}
