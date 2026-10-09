import type { PaymentMethod } from './api'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  MERCADOPAGO: 'Mercado Pago',
  OTHER: 'Otro',
}

export function normalizeAmount(input: string): string {
  return input.trim().replace(/\s/g, '').replace(',', '.')
}

export function isValidAmount(input: string): boolean {
  return /^(?!0+(\.0+)?$)\d{1,12}(\.\d{1,2})?$/.test(normalizeAmount(input))
}

export const PRICE_PRESETS = [25, 10, -10, -25] as const

export function adjustByPercent(amount: string, percent: number): string {
  const cents = Math.round(Number(amount) * 100)
  const adjusted = Math.round((cents * (100 + percent)) / 100)
  return (adjusted / 100).toFixed(2)
}
