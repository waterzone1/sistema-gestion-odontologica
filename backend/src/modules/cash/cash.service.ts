import type { Payment, Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { recordAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { organizationTimeZone } from '../availability/availability.service.js'
import { addDays, fromLocal } from '../availability/domain/availability.js'
import { cents, creditFields, paymentFields } from '../billing/billing.mapping.js'
import { fromCents, localDay, sum, toCents } from '../billing/domain/balance.js'
import { patientName } from '../patients/domain/name.js'
import type { CashDayDto, ExchangeRateDto, ExchangeRatesDto } from './cash.schemas.js'

const HISTORY_LIMIT = 20

const rateInclude = { setBy: { select: { displayName: true } } } as const
type RateRecord = Prisma.ExchangeRateGetPayload<{ include: typeof rateInclude }>

function toRateDto(rate: RateRecord): ExchangeRateDto {
  return {
    id: rate.id,
    currency: rate.currency,
    rate: rate.rate.toFixed(2),
    setBy: rate.setBy.displayName,
    createdAt: rate.createdAt.toISOString(),
  }
}

export function currentRate(db: Pick<Db, 'exchangeRate'>, organizationId: string) {
  return db.exchangeRate.findFirst({
    where: { organizationId, currency: 'USD' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
}

export async function getExchangeRates(db: Db, actor: AuthContext): Promise<ExchangeRatesDto> {
  const history = await db.exchangeRate.findMany({
    where: { organizationId: actor.organizationId, currency: 'USD' },
    include: rateInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: HISTORY_LIMIT,
  })
  const items = history.map(toRateDto)
  return { current: items[0] ?? null, history: items }
}

export async function setExchangeRate(db: Db, actor: AuthContext, rate: string): Promise<ExchangeRatesDto> {
  await db.$transaction(async (tx) => {
    const previous = await currentRate(tx, actor.organizationId)
    const created = await tx.exchangeRate.create({
      data: { organizationId: actor.organizationId, currency: 'USD', rate: fromCents(toCents(rate)), setById: actor.userId },
    })
    await recordAudit(tx, {
      action: 'EXCHANGE_RATE_SET',
      entityType: 'ExchangeRate',
      entityId: created.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { currency: 'USD', before: previous?.rate.toFixed(2) ?? null, after: created.rate.toFixed(2) },
    })
  })
  return getExchangeRates(db, actor)
}

export async function getCashDay(db: Db, actor: AuthContext, date: string | undefined): Promise<CashDayDto> {
  const timeZone = await organizationTimeZone(db, actor.organizationId)
  const day = date ?? localDay(new Date(), timeZone)
  if (day > localDay(new Date(), timeZone)) throw new AppError(422, 'FUTURE_DATE', 'La fecha no puede ser futura')
  const range = { gte: fromLocal(day, 0, timeZone), lt: fromLocal(addDays(day, 1), 0, timeZone) }
  const include = {
    patient: { select: { id: true, firstName: true, lastName: true } },
    createdBy: { select: { displayName: true } },
  } as const
  const [payments, credits] = await Promise.all([
    db.payment.findMany({
      where: { organizationId: actor.organizationId, receivedAt: range },
      include,
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    }),
    db.creditApplication.findMany({
      where: { organizationId: actor.organizationId, createdAt: range },
      include,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ])

  const extra = (row: (typeof payments)[number] | (typeof credits)[number]) => ({
    patient: { id: row.patient.id, fullName: patientName(row.patient) },
    createdBy: row.createdBy.displayName,
  })
  const movements: CashDayDto['movements'] = [
    ...payments.map((payment) => ({ ...paymentFields(payment), kind: 'PAYMENT' as const, ...extra(payment) })),
    ...credits.map((credit) => ({ ...creditFields(credit), kind: 'CREDIT' as const, ...extra(credit) })),
  ].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))

  const totals = new Map<string, { method: Payment['method']; currency: Payment['currency']; count: number; original: number; ars: number }>()
  for (const payment of payments.filter((p) => !p.voidedAt)) {
    const key = `${payment.method}-${payment.currency}`
    const total = totals.get(key) ?? { method: payment.method, currency: payment.currency, count: 0, original: 0, ars: 0 }
    total.count += 1
    total.original += cents(payment.originalAmount)
    total.ars += cents(payment.amount)
    totals.set(key, total)
  }
  const rows = [...totals.values()]
  const currencies = [...new Set(rows.map((row) => row.currency))]

  return {
    date: day,
    movements,
    totals: rows.map(({ original, ars, ...total }) => ({ ...total, originalTotal: fromCents(original), amountTotal: fromCents(ars) })),
    byCurrency: currencies.map((currency) => {
      const ofCurrency = rows.filter((row) => row.currency === currency)
      return {
        currency,
        originalTotal: fromCents(sum(ofCurrency.map((row) => row.original))),
        amountTotal: fromCents(sum(ofCurrency.map((row) => row.ars))),
      }
    }),
    totalArs: fromCents(sum(rows.map((row) => row.ars))),
    creditTotal: fromCents(sum(credits.filter((credit) => !credit.voidedAt).map((credit) => cents(credit.amount)))),
    voidedCount: movements.filter((movement) => movement.status === 'VOIDED').length,
  }
}
