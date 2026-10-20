import type { CreditApplication, Payment, Prisma } from '../../generated/prisma/client.js'
import { toCents } from './domain/balance.js'

export const cents = (value: Prisma.Decimal) => toCents(value.toFixed(2))

const statusOf = (record: { voidedAt: Date | null }) => (record.voidedAt ? ('VOIDED' as const) : ('ACTIVE' as const))

export function paymentFields(payment: Payment) {
  return {
    id: payment.id,
    amount: payment.amount.toFixed(2),
    currency: payment.currency,
    originalAmount: payment.originalAmount.toFixed(2),
    exchangeRate: payment.exchangeRate.toFixed(2),
    method: payment.method,
    externalReference: payment.externalReference,
    receivedAt: payment.receivedAt.toISOString(),
    status: statusOf(payment),
    voidReason: payment.voidReason,
  }
}

export function creditFields(credit: CreditApplication) {
  return {
    id: credit.id,
    amount: credit.amount.toFixed(2),
    currency: 'ARS' as const,
    originalAmount: credit.amount.toFixed(2),
    exchangeRate: '1.00',
    method: 'CREDIT' as const,
    externalReference: null,
    receivedAt: credit.createdAt.toISOString(),
    status: statusOf(credit),
    voidReason: credit.voidReason,
  }
}
