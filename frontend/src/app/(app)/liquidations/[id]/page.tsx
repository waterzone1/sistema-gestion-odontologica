'use client'

import { ArrowLeft, Download } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Figure } from '@/components/billing/figure'
import { ReasonDialog } from '@/components/billing/reason-dialog'
import { FormError } from '@/components/form-error'
import { LoadingBlock, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useLiquidation, useLiquidationAction } from '@/hooks/use-liquidations'
import { useSession } from '@/hooks/use-session'
import type { Liquidation } from '@/lib/api'
import { isValidAmount, normalizeAmount } from '@/lib/billing'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'
import { ITEM_RESULT_LABELS, LIQUIDATION_STATUS_LABELS, liquidationVariant } from '@/lib/liquidations'
import { can } from '@/lib/permissions'

type Item = Liquidation['items'][number]

export default function LiquidationPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'liquidations:manage')
  const liquidation = useLiquidation(id, allowed)
  const action = useLiquidationAction(id)
  const [debiting, setDebiting] = useState<Item | null>(null)
  const [rejecting, setRejecting] = useState<Item | null>(null)
  const [paying, setPaying] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  if (!user || !allowed || liquidation.isPending) return <LoadingBlock />
  if (liquidation.isError) return <FormError error={liquidation.error} />

  const data = liquidation.data
  const submitted = data.status === 'SUBMITTED'

  return (
    <>
      <Link href="/liquidations" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Liquidaciones
      </Link>
      <PageHeader
        title={`${data.provider.name} · ${formatDate(data.periodFrom)} al ${formatDate(data.periodTo)}`}
        description={`Armada por ${data.createdBy} el ${formatDateTime(data.createdAt)}`}
        actions={
          <>
            <a href={`/api/liquidations/${data.id}/export`} className={buttonVariants({ variant: 'outline' })}>
              <Download className="size-4" aria-hidden />
              Exportar CSV
            </a>
            {data.status === 'DRAFT' && (
              <Button disabled={action.isPending} onClick={() => action.mutate({ kind: 'submit' })}>
                Marcar como presentada
              </Button>
            )}
            {submitted && data.totals.pending === 0 && <Button onClick={() => setPaying(true)}>Registrar pago</Button>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant={liquidationVariant(data.status)}>{LIQUIDATION_STATUS_LABELS[data.status]}</Badge>
        {data.paidAt && (
          <span className="text-sm text-muted-foreground">
            Pagada el {formatDateTime(data.paidAt)} · {formatMoney(data.paidAmount ?? '0')}
            {data.paymentReference && ` · ${data.paymentReference}`}
          </span>
        )}
        {data.cancelReason && <span className="text-sm text-muted-foreground">Motivo: {data.cancelReason}</span>}
        {(data.status === 'DRAFT' || submitted) && data.totals.pending === data.totals.items && (
          <Button variant="outline" size="sm" onClick={() => setCancelling(true)}>
            Anular liquidación
          </Button>
        )}
      </div>
      <FormError error={action.error} className="mb-4" />

      <section aria-label="Totales" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Reclamado" value={formatMoney(data.totals.claimed)} hint={`${data.totals.items} prestaciones`} />
        <Figure label="Aprobado" value={formatMoney(data.totals.approved)} emphasis />
        <Figure label="Debitado" value={formatMoney(data.totals.debited)} />
        <Figure label="Rechazado" value={formatMoney(data.totals.rejected)} hint={`${data.totals.pending} sin resultado`} />
      </section>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Fecha</th>
              <th scope="col" className="px-3 py-2 font-medium">Paciente</th>
              <th scope="col" className="px-3 py-2 font-medium">Práctica</th>
              <th scope="col" className="px-3 py-2 font-medium">Reclamado</th>
              <th scope="col" className="px-3 py-2 font-medium">Resultado</th>
              {submitted && <th scope="col" className="px-3 py-2 text-right font-medium">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2">{formatDate(item.service.performedAt)}</td>
                <td className="px-3 py-2">
                  <Link href={`/patients/${item.service.patient.id}`} className="text-primary hover:underline">
                    {item.service.patient.fullName}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {item.service.plan} · Afiliado {item.service.affiliateNumber}
                    {item.service.authorizationCode && ` · Aut. ${item.service.authorizationCode}`}
                  </span>
                </td>
                <td className="px-3 py-2">{item.service.practice.name}</td>
                <td className="px-3 py-2">{formatMoney(item.claimedAmount)}</td>
                <td className="px-3 py-2">
                  {ITEM_RESULT_LABELS[item.status]}
                  {item.status === 'DEBITED' && item.approvedAmount && ` · ${formatMoney(item.approvedAmount)}`}
                  {item.reason && <span className="block text-xs text-muted-foreground">{item.reason}</span>}
                </td>
                {submitted && (
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={action.isPending || item.status === 'APPROVED'}
                        onClick={() => action.mutate({ kind: 'result', itemId: item.id, status: 'APPROVED' })}
                      >
                        Aprobar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDebiting(item)}>
                        Débito
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setRejecting(item)}>
                        Rechazar
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={debiting !== null} onOpenChange={(open) => !open && setDebiting(null)}>
        {debiting && (
          <DialogContent title="Registrar débito" description={`Reclamado: ${formatMoney(debiting.claimedAmount)}`}>
            <DebitForm
              item={debiting}
              pending={action.isPending}
              onCancel={() => setDebiting(null)}
              onSave={(approvedAmount, reason) =>
                action.mutate(
                  { kind: 'result', itemId: debiting.id, status: 'DEBITED', approvedAmount, reason },
                  { onSuccess: () => setDebiting(null) },
                )
              }
            />
          </DialogContent>
        )}
      </Dialog>
      <ReasonDialog
        key={rejecting?.id}
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title="Rechazo de la cobertura"
        description="La prestación queda libre para volver a presentarla en otra liquidación."
        confirmLabel="Registrar rechazo"
        pending={action.isPending}
        error={action.error}
        onConfirm={(reason) =>
          rejecting &&
          action.mutate({ kind: 'result', itemId: rejecting.id, status: 'REJECTED', reason }, { onSuccess: () => setRejecting(null) })
        }
      />
      <ReasonDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Anular liquidación"
        description="Se conserva como anulada y sus prestaciones vuelven a quedar para liquidar."
        confirmLabel="Anular"
        pending={action.isPending}
        error={action.error}
        onConfirm={(reason) => action.mutate({ kind: 'cancel', reason }, { onSuccess: () => setCancelling(false) })}
      />
      <Dialog open={paying} onOpenChange={setPaying}>
        {paying && (
          <DialogContent title="Pago de la cobertura" description={`Aprobado: ${formatMoney(data.totals.approved)}`}>
            <PaymentForm
              suggested={data.totals.approved}
              pending={action.isPending}
              onCancel={() => setPaying(false)}
              onSave={(amount, reference) =>
                action.mutate({ kind: 'payment', amount, ...(reference ? { reference } : {}) }, { onSuccess: () => setPaying(false) })
              }
            />
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}

function DebitForm({
  item,
  pending,
  onCancel,
  onSave,
}: {
  item: Item
  pending: boolean
  onCancel: () => void
  onSave: (approvedAmount: string, reason: string) => void
}) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const below = isValidAmount(amount) && Number(normalizeAmount(amount)) < Number(item.claimedAmount)
  return (
    <div className="space-y-4">
      <Field label="Lo que aprobó la cobertura" htmlFor="debit-amount" error={amount && !below ? 'Tiene que ser menor a lo reclamado' : undefined}>
        <Input id="debit-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Motivo del débito" htmlFor="debit-reason">
        <Input id="debit-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button disabled={!below || reason.trim().length < 3 || pending} onClick={() => onSave(normalizeAmount(amount), reason.trim())}>
          Registrar débito
        </Button>
      </DialogFooter>
    </div>
  )
}

function PaymentForm({
  suggested,
  pending,
  onCancel,
  onSave,
}: {
  suggested: string
  pending: boolean
  onCancel: () => void
  onSave: (amount: string, reference: string) => void
}) {
  const [amount, setAmount] = useState(suggested)
  const [reference, setReference] = useState('')
  const valid = isValidAmount(amount, { allowZero: true })
  return (
    <div className="space-y-4">
      <Field label="Importe recibido" htmlFor="payment-amount">
        <Input id="payment-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Referencia (opcional)" htmlFor="payment-reference">
        <Input id="payment-reference" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} />
      </Field>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button disabled={!valid || pending} onClick={() => onSave(normalizeAmount(amount), reference.trim())}>
          Registrar pago
        </Button>
      </DialogFooter>
    </div>
  )
}
