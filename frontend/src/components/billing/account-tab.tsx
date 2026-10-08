'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { ReasonDialog } from '@/components/billing/reason-dialog'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckboxGroup } from '@/components/ui/checkbox-group'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { useAccount, useRecordPayment, useVoid } from '@/hooks/use-billing'
import type { Account, Payment, PaymentMethod } from '@/lib/api'
import { isValidAmount, normalizeAmount, PAYMENT_METHOD_LABELS } from '@/lib/billing'
import { formatDateTime, formatMoney } from '@/lib/format'

interface Props {
  patientId: string
  canCollect: boolean
  canVoid: boolean
}

export function AccountTab({ patientId, canCollect, canVoid }: Props) {
  const account = useAccount(patientId)
  const [collecting, setCollecting] = useState(false)
  const [voiding, setVoiding] = useState<Payment | null>(null)
  const voidPayment = useVoid(patientId, 'payments')

  if (account.isPending) return <LoadingBlock />
  if (account.isError) return <FormError error={account.error} />

  const { balance, totalServices, totalPayments, payments } = account.data
  const owes = Number(balance) > 0
  const inFavor = Number(balance) < 0

  return (
    <div className="space-y-6">
      <section aria-label="Resumen de cuenta" className="grid gap-3 sm:grid-cols-3">
        <Figure label="Prestaciones" value={formatMoney(totalServices)} />
        <Figure label="Pagos" value={formatMoney(totalPayments)} />
        <Figure
          label={inFavor ? 'Saldo a favor' : 'Saldo a cobrar'}
          value={formatMoney(inFavor ? String(Math.abs(Number(balance))) : balance)}
          emphasis={owes}
        />
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
            {payments.map((payment) => (
              <li key={payment.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <p className="font-medium">
                    {formatMoney(payment.amount)} · {PAYMENT_METHOD_LABELS[payment.method]}
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
                    canVoid && (
                      <Button variant="outline" onClick={() => setVoiding(payment)}>
                        Anular
                      </Button>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PaymentDialog
        patientId={patientId}
        account={account.data}
        open={collecting}
        onOpenChange={setCollecting}
      />
      <ReasonDialog
        key={voiding?.id}
        open={voiding !== null}
        onOpenChange={(open) => !open && setVoiding(null)}
        title="Anular pago"
        description="El pago se conserva marcado como anulado y deja de contar en el saldo."
        confirmLabel="Anular pago"
        pending={voidPayment.isPending}
        error={voidPayment.error}
        onConfirm={(reason) =>
          voiding && voidPayment.mutate({ id: voiding.id, reason }, { onSuccess: () => setVoiding(null) })
        }
      />
    </div>
  )
}

function Figure({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={emphasis ? 'mt-1 text-xl font-semibold text-primary' : 'mt-1 text-xl font-semibold'}>{value}</p>
    </div>
  )
}

function PaymentDialog({
  patientId,
  account,
  open,
  onOpenChange,
}: {
  patientId: string
  account: Account
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const record = useRecordPayment(patientId)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [reference, setReference] = useState('')
  const [serviceIds, setServiceIds] = useState<string[]>([])

  const pending = account.services.filter((service) => service.status === 'ACTIVE' && Number(service.pending) > 0)
  const valid = isValidAmount(amount)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    record.mutate(
      {
        amount: normalizeAmount(amount),
        method,
        ...(reference.trim() ? { externalReference: reference.trim() } : {}),
        ...(serviceIds.length > 0 ? { serviceIds } : {}),
      },
      {
        onSuccess: () => {
          setAmount('')
          setReference('')
          setServiceIds([])
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Registrar pago"
        description="Se aplica a las prestaciones más antiguas, salvo que elijas cuáles cubrir. Admite pagos parciales."
      >
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Importe"
            htmlFor="payment-amount"
            error={amount && !valid ? 'Ingresá un importe mayor a cero, con hasta 2 decimales' : undefined}
          >
            <Input
              id="payment-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={Boolean(amount) && !valid}
            />
          </Field>
          <Field label="Medio de pago" htmlFor="payment-method">
            <Select
              id="payment-method"
              value={method}
              onChange={(event) => setMethod(event.target.value as PaymentMethod)}
            >
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Referencia (opcional)" htmlFor="payment-reference" hint="Por ejemplo, el número de operación.">
            <Input
              id="payment-reference"
              maxLength={120}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>
          {pending.length > 0 && (
            <CheckboxGroup
              legend="Cubrir solo estas prestaciones (opcional)"
              idPrefix="payment-service"
              value={serviceIds}
              onChange={setServiceIds}
              options={pending.map((service) => ({
                value: service.id,
                label: service.practice.name,
                hint: `Pendiente ${formatMoney(service.pending)}`,
              }))}
            />
          )}
          <FormError error={record.error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={record.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || record.isPending}>
              {record.isPending ? 'Registrando…' : 'Registrar pago'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
