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
