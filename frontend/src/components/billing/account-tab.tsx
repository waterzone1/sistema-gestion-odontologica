'use client'

import { Plus, Trash2 } from 'lucide-react'
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
import { useAccount, useRecordCharge, useVoid, type ChargeInput } from '@/hooks/use-billing'
import type { Account, Payment, PaymentMethod } from '@/lib/api'
import { isValidAmount, normalizeAmount, PAYMENT_METHOD_LABELS } from '@/lib/billing'
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

  if (account.isPending) return <LoadingBlock />
  if (account.isError) return <FormError error={account.error} />

  const { balance, totalServices, totalPayments, availableCredit, payments } = account.data
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
      {owes && Number(availableCredit) > 0 && (
        <p className="text-sm text-muted-foreground">
          Tiene {formatMoney(availableCredit)} de saldo a favor sin aplicar: podés usarlo al registrar el pago.
        </p>
      )}

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
                <div className="min-w-0 text-sm">
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

interface Line {
  key: number
  amount: string
  method: PaymentMethod
  reference: string
}

const toCents = (amount: string) => Math.round(Number(normalizeAmount(amount)) * 100)

function ChargeForm({ patientId, account, onClose }: { patientId: string; account: Account; onClose: () => void }) {
  const record = useRecordCharge(patientId)
  const [lines, setLines] = useState<Line[]>([{ key: 0, amount: '', method: 'CASH', reference: '' }])
  const [credit, setCredit] = useState('')
  const [serviceIds, setServiceIds] = useState<string[]>([])

  const pending = account.services.filter((s) => s.status === 'ACTIVE' && s.pending !== null && Number(s.pending) > 0)
  const creditCents = toCents(account.availableCredit)
  const pendingCents = pending
    .filter((s) => serviceIds.length === 0 || serviceIds.includes(s.id))
    .reduce((total, s) => total + toCents(s.pending ?? '0'), 0)
  const creditLimit = Math.min(creditCents, pendingCents)

  const filledLines = lines.filter((line) => line.amount.trim() !== '')
  const linesValid = filledLines.every((line) => isValidAmount(line.amount))
  const creditValid = credit.trim() === '' || (isValidAmount(credit) && toCents(credit) <= creditLimit)
  const total =
    filledLines.reduce((sum, line) => sum + (isValidAmount(line.amount) ? toCents(line.amount) : 0), 0) +
    (credit.trim() && isValidAmount(credit) ? toCents(credit) : 0)
  const valid = linesValid && creditValid && total > 0

  const update = (key: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const input: ChargeInput = {
      lines: filledLines.map((line) => ({
        amount: normalizeAmount(line.amount),
        method: line.method,
        ...(line.reference.trim() ? { externalReference: line.reference.trim() } : {}),
      })),
      ...(credit.trim() ? { credit: normalizeAmount(credit) } : {}),
      ...(serviceIds.length > 0 ? { serviceIds } : {}),
    }
    record.mutate(input, { onSuccess: onClose })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Medios de pago</legend>
        {lines.map((line, index) => (
          <div key={line.key} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field
              label="Importe"
              htmlFor={`line-amount-${line.key}`}
              error={line.amount && !isValidAmount(line.amount) ? 'Importe inválido' : undefined}
            >
              <Input
                id={`line-amount-${line.key}`}
                inputMode="decimal"
                autoComplete="off"
                value={line.amount}
                onChange={(event) => update(line.key, { amount: event.target.value })}
              />
            </Field>
            <Field label="Medio de pago" htmlFor={`line-method-${line.key}`}>
              <Select
                id={`line-method-${line.key}`}
                value={line.method}
                onChange={(event) => update(line.key, { method: event.target.value as PaymentMethod })}
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            {lines.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                className="justify-self-end"
                aria-label={`Quitar el medio de pago ${index + 1}`}
                onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            ) : (
              <span />
            )}
            {line.method !== 'CASH' && (
              <Field label="Referencia (opcional)" htmlFor={`line-reference-${line.key}`} className="sm:col-span-3">
                <Input
                  id={`line-reference-${line.key}`}
                  maxLength={120}
                  placeholder="Por ejemplo, el número de operación"
                  value={line.reference}
                  onChange={(event) => update(line.key, { reference: event.target.value })}
                />
              </Field>
            )}
          </div>
        ))}
        {lines.length < 10 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setLines((current) => [
                ...current,
                { key: Math.max(...current.map((l) => l.key)) + 1, amount: '', method: 'TRANSFER', reference: '' },
              ])
            }
          >
            <Plus className="size-4" aria-hidden />
            Agregar otro medio de pago
          </Button>
        )}
      </fieldset>

      {creditCents > 0 && (
        <Field
          label="Usar saldo a favor"
          htmlFor="charge-credit"
          hint={`Disponible: ${formatMoney(account.availableCredit)}. Se aplica antes que los demás medios.`}
          error={credit && !creditValid ? `Hasta ${formatMoney((creditLimit / 100).toFixed(2))}` : undefined}
        >
          <Input
            id="charge-credit"
            inputMode="decimal"
            autoComplete="off"
            value={credit}
            onChange={(event) => setCredit(event.target.value)}
          />
        </Field>
      )}

      {pending.length > 0 && (
        <CheckboxGroup
          legend="Cubrir solo estas prestaciones (opcional)"
          idPrefix="payment-service"
          value={serviceIds}
          onChange={setServiceIds}
          options={pending.map((service) => ({
            value: service.id,
            label: service.practice.name,
            hint: `Pendiente ${formatMoney(service.pending ?? '0')}`,
          }))}
        />
      )}

      <p className="text-sm">
        Total del cobro: <span className="font-semibold">{formatMoney((total / 100).toFixed(2))}</span>
      </p>
      <FormError error={record.error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={record.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!valid || record.isPending}>
          {record.isPending ? 'Registrando…' : 'Registrar pago'}
        </Button>
      </DialogFooter>
    </form>
  )
}
