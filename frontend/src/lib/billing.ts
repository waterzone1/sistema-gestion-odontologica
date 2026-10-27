import type { Currency, MovementMethod } from './api'
import { formatMoney } from './format'

export const PAYMENT_METHOD_LABELS: Record<MovementMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  MERCADOPAGO: 'Mercado Pago',
  OTHER: 'Otro',
  CREDIT: 'Saldo a favor',
}

export function normalizeAmount(input: string): string {
  return input.trim().replace(/\s/g, '').replace(',', '.')
}

export function isValidAmount(input: string, { allowZero = false } = {}): boolean {
  const pattern = allowZero ? /^\d{1,12}(\.\d{1,2})?$/ : /^(?!0+(\.0+)?$)\d{1,12}(\.\d{1,2})?$/
  return pattern.test(normalizeAmount(input))
}

export const CURRENCY_LABELS: Record<Currency, string> = { ARS: 'Pesos', USD: 'Dólares' }

export const toCents = (amount: string) => Math.round(Number(normalizeAmount(amount)) * 100)
export const centsText = (cents: number) => (cents / 100).toFixed(2)

export function toPesosCents(amountCents: number, currency: Currency, rateCents: number | null): number | null {
  if (currency === 'ARS') return amountCents
  if (rateCents === null) return null
  return Math.round((amountCents * rateCents) / 100)
}

export function paymentAmountText(payment: { amount: string; currency: Currency; originalAmount: string; exchangeRate: string }): string {
  if (payment.currency === 'ARS') return formatMoney(payment.amount)
  return `${formatMoney(payment.originalAmount, payment.currency)} (a ${formatMoney(payment.exchangeRate)}) = ${formatMoney(payment.amount)}`
}

export const PRICE_PRESETS = [25, 10, -10, -25] as const

export function adjustByPercent(amount: string, percent: number): string {
  const cents = Math.round(Number(amount) * 100)
  const adjusted = Math.round((cents * (100 + percent)) / 100)
  return (adjusted / 100).toFixed(2)
}
