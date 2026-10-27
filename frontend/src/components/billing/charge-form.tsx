'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { PatientNotesInline } from '@/components/patients/patient-notes'
import { Button } from '@/components/ui/button'
import { CheckboxGroup } from '@/components/ui/checkbox-group'
import { DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { useExchangeRates, useRecordCharge, type ChargeInput } from '@/hooks/use-billing'
import { ApiError, type Account, type Currency, type MovementMethod, type PaymentMethod } from '@/lib/api'
import {
  centsText,
  CURRENCY_LABELS,
  isValidAmount,
  normalizeAmount,
  PAYMENT_METHOD_LABELS,
  toCents,
  toPesosCents,
} from '@/lib/billing'
import { formatMoney } from '@/lib/format'

interface Line {
  key: number
  amount: string
  currency: Currency
  method: MovementMethod
  reference: string
}

interface Props {
  patientId: string
  account: Account
  onClose: () => void
}

export function ChargeForm({ patientId, account, onClose }: Props) {
  const record = useRecordCharge(patientId)
  const rates = useExchangeRates(true)
  const [lines, setLines] = useState<Line[]>([{ key: 0, amount: '', currency: 'ARS', method: 'CASH', reference: '' }])
  const [serviceIds, setServiceIds] = useState<string[]>([])

  const rate = rates.data?.current?.rate ?? null
  const rateCents = rate ? toCents(rate) : null
  const pending = account.services.filter((s) => s.status === 'ACTIVE' && s.pending !== null && Number(s.pending) > 0)
  const pendingCents = pending
    .filter((s) => serviceIds.length === 0 || serviceIds.includes(s.id))
    .reduce((total, s) => total + toCents(s.pending ?? '0'), 0)
  const creditLimit = Math.min(toCents(account.availableCredit), pendingCents)
  const methods = (Object.keys(PAYMENT_METHOD_LABELS) as MovementMethod[]).filter(
    (method) => method !== 'CREDIT' || toCents(account.availableCredit) > 0,
  )

  const filled = lines.filter((line) => line.amount.trim() !== '')
  const pesosOf = (line: Line) => (isValidAmount(line.amount) ? toPesosCents(toCents(line.amount), line.currency, rateCents) : null)
  const creditCents = filled
    .filter((line) => line.method === 'CREDIT' && isValidAmount(line.amount))
    .reduce((total, line) => total + toCents(line.amount), 0)
  const creditError = creditCents > creditLimit ? `El saldo a favor aplicable es hasta ${formatMoney(centsText(creditLimit))}` : null
  const total = filled.reduce((sum, line) => sum + (pesosOf(line) ?? 0), 0)
  const usesDollars = filled.some((line) => line.currency === 'USD')
  const valid = filled.length > 0 && filled.every((line) => pesosOf(line) !== null) && !creditError
  const rateChanged = record.error instanceof ApiError && record.error.code === 'EXCHANGE_RATE_CHANGED'

  const update = (key: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const input: ChargeInput = {
      lines: filled
        .filter((line) => line.method !== 'CREDIT')
        .map((line) => ({
          amount: normalizeAmount(line.amount),
          currency: line.currency,
          method: line.method as PaymentMethod,
          ...(line.reference.trim() ? { externalReference: line.reference.trim() } : {}),
        })),
      ...(usesDollars && rate ? { exchangeRate: rate } : {}),
      ...(creditCents > 0 ? { credit: centsText(creditCents) } : {}),
      ...(serviceIds.length > 0 ? { serviceIds } : {}),
    }
    record.mutate(input, { onSuccess: onClose, onError: () => void rates.refetch() })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PatientNotesInline patientId={patientId} />
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Medios de pago</legend>
        {lines.map((line, index) => {
          const pesos = pesosOf(line)
          return (
            <div key={line.key} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
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
              <Field label="Moneda" htmlFor={`line-currency-${line.key}`}>
                <Select
                  id={`line-currency-${line.key}`}
                  value={line.currency}
                  disabled={line.method === 'CREDIT'}
                  onChange={(event) => update(line.key, { currency: event.target.value as Currency })}
                >
                  {(Object.keys(CURRENCY_LABELS) as Currency[]).map((currency) => (
                    <option key={currency} value={currency}>
                      {CURRENCY_LABELS[currency]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Medio de pago" htmlFor={`line-method-${line.key}`}>
                <Select
                  id={`line-method-${line.key}`}
                  value={line.method}
                  onChange={(event) => {
                    const method = event.target.value as MovementMethod
                    update(line.key, method === 'CREDIT' ? { method, currency: 'ARS' } : { method })
                  }}
                >
                  {methods.map((method) => (
                    <option key={method} value={method}>
                      {method === 'CREDIT'
                        ? `Saldo a favor (disponible ${formatMoney(account.availableCredit)})`
                        : PAYMENT_METHOD_LABELS[method]}
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
              {line.currency === 'USD' && (
                <p className="text-xs text-muted-foreground sm:col-span-4">
                  {rate
                    ? `Cotización ${formatMoney(rate)}${pesos !== null ? ` · Equivale a ${formatMoney(centsText(pesos))}` : ''}`
                    : 'Todavía no se cargó la cotización del dólar: cargala en Configuración.'}
                </p>
              )}
              {line.method !== 'CASH' && line.method !== 'CREDIT' && (
                <Field label="Referencia (opcional)" htmlFor={`line-reference-${line.key}`} className="sm:col-span-4">
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
          )
        })}
        {creditError && (
          <p role="alert" className="text-xs text-destructive">
            {creditError}
          </p>
        )}
        {lines.length < 10 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setLines((current) => [
                ...current,
                {
                  key: Math.max(...current.map((l) => l.key)) + 1,
                  amount: '',
                  currency: 'ARS',
                  method: 'TRANSFER',
                  reference: '',
                },
              ])
            }
          >
            <Plus className="size-4" aria-hidden />
            Agregar otro medio de pago
          </Button>
        )}
      </fieldset>

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
        Total del cobro en pesos: <span className="font-semibold">{formatMoney(centsText(total))}</span>
      </p>
      {rateChanged ? (
        <p role="alert" className="text-sm text-destructive">
          {record.error?.message} Los importes ya se recalcularon: revisalos y volvé a registrar.
        </p>
      ) : (
        <FormError error={record.error} />
      )}
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
