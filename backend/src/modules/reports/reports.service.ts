import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import type { AuthContext } from '../auth/auth.types.js'
import { organizationTimeZone } from '../availability/availability.service.js'
import { localDayRange } from '../availability/domain/availability.js'
import { cents } from '../billing/billing.mapping.js'
import { fromCents, sum } from '../billing/domain/balance.js'
import type {
  AppointmentsReportDto,
  CollectionsReportDto,
  ReportQuery,
  ServicesReportDto,
} from './reports.schemas.js'

type Counts = AppointmentsReportDto['totals']

const emptyCounts = (): Counts => ({ total: 0, scheduled: 0, confirmed: 0, attended: 0, noShow: 0, cancelled: 0 })

const STATUS_FIELD = {
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  ATTENDED: 'attended',
  NO_SHOW: 'noShow',
  CANCELLED: 'cancelled',
} as const

function addCount(counts: Counts, status: keyof typeof STATUS_FIELD, amount: number) {
  counts.total += amount
  counts[STATUS_FIELD[status]] += amount
}

async function rangeOf(db: Db, actor: AuthContext, query: ReportQuery) {
  const timeZone = await organizationTimeZone(db, actor.organizationId)
  return { timeZone, range: localDayRange(query.from, query.to, timeZone) }
}

export async function appointmentsReport(db: Db, actor: AuthContext, query: ReportQuery): Promise<AppointmentsReportDto> {
  const { range } = await rangeOf(db, actor, query)
  const where: Prisma.AppointmentWhereInput = {
    organizationId: actor.organizationId,
    startsAt: range,
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.professionalId ? { professionalId: query.professionalId } : {}),
  }
  const [groups, professionals] = await Promise.all([
    db.appointment.groupBy({ by: ['professionalId', 'status'], where, _count: { _all: true } }),
    db.professionalProfile.findMany({
      where: { user: { organizationId: actor.organizationId } },
      select: { id: true, user: { select: { displayName: true } } },
    }),
  ])
  const names = new Map(professionals.map((p) => [p.id, p.user.displayName]))
  const totals = emptyCounts()
  const byProfessional = new Map<string, Counts>()
  for (const group of groups) {
    addCount(totals, group.status, group._count._all)
    const counts = byProfessional.get(group.professionalId) ?? emptyCounts()
    addCount(counts, group.status, group._count._all)
    byProfessional.set(group.professionalId, counts)
  }
  return {
    totals,
    byProfessional: [...byProfessional.entries()]
      .map(([id, counts]) => ({ ...counts, professional: { id, displayName: names.get(id) ?? '' } }))
      .sort((a, b) => b.total - a.total),
  }
}

export async function collectionsReport(db: Db, actor: AuthContext, query: ReportQuery): Promise<CollectionsReportDto> {
  const { range, timeZone } = await rangeOf(db, actor, query)
  const where = { organizationId: actor.organizationId, receivedAt: range, voidedAt: null }
  const [byMethod, byDay] = await Promise.all([
    db.payment.groupBy({
      by: ['method', 'currency'],
      where,
      _count: { _all: true },
      _sum: { amount: true, originalAmount: true },
      orderBy: [{ method: 'asc' }, { currency: 'asc' }],
    }),
    db.$queryRaw<{ day: string; count: number; amount: Prisma.Decimal }[]>`
      SELECT to_char("receivedAt" AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day, count(*)::int AS count, sum(amount) AS amount
      FROM "Payment"
      WHERE "organizationId" = ${actor.organizationId}::uuid AND "voidedAt" IS NULL
        AND "receivedAt" >= ${range.gte} AND "receivedAt" < ${range.lt}
      GROUP BY 1
      ORDER BY 1`,
  ])
  const decimal = (value: Prisma.Decimal | null) => (value ? cents(value) : 0)
  return {
    totalArs: fromCents(sum(byMethod.map((row) => decimal(row._sum.amount)))),
    byDay: byDay.map((row) => ({ date: row.day, count: row.count, amountArs: fromCents(decimal(row.amount)) })),
    byMethod: byMethod.map((row) => ({
      method: row.method,
      currency: row.currency,
      count: row._count._all,
      originalTotal: fromCents(decimal(row._sum.originalAmount)),
      amountArs: fromCents(decimal(row._sum.amount)),
    })),
  }
}

export async function servicesReport(db: Db, actor: AuthContext, query: ReportQuery): Promise<ServicesReportDto> {
  const { range } = await rangeOf(db, actor, query)
  const where: Prisma.PerformedServiceWhereInput = {
    organizationId: actor.organizationId,
    performedAt: range,
    voidedAt: null,
    ...(query.professionalId ? { professionalId: query.professionalId } : {}),
    ...(query.branchId ? { appointment: { branchId: query.branchId } } : {}),
  }
  const totals = { _count: { _all: true }, _sum: { price: true, coverageAmount: true } } as const
  const [byProfessional, byPractice, professionals, practices] = await Promise.all([
    db.performedService.groupBy({ by: ['professionalId'], where, ...totals }),
    db.performedService.groupBy({ by: ['practiceId'], where, ...totals }),
    db.professionalProfile.findMany({
      where: { user: { organizationId: actor.organizationId } },
      select: { id: true, user: { select: { displayName: true } } },
    }),
    db.practice.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, code: true, name: true } }),
  ])
  const names = new Map(professionals.map((p) => [p.id, p.user.displayName]))
  const practiceOf = new Map(practices.map((p) => [p.id, p]))
  const amounts = (row: { _count: { _all: number }; _sum: { price: Prisma.Decimal | null; coverageAmount: Prisma.Decimal | null } }) => {
    const patient = row._sum.price ? cents(row._sum.price) : 0
    const coverage = row._sum.coverageAmount ? cents(row._sum.coverageAmount) : 0
    return { count: row._count._all, patientAmount: fromCents(patient), coverageAmount: fromCents(coverage), total: patient + coverage }
  }
  const byTotal = <T extends { total: number }>(a: T, b: T) => b.total - a.total
  return {
    byProfessional: byProfessional
      .map((row) => ({ professional: { id: row.professionalId, displayName: names.get(row.professionalId) ?? '' }, ...amounts(row) }))
      .sort(byTotal)
      .map(({ total: _total, ...row }) => row),
    byPractice: byPractice
      .map((row) => ({ practice: practiceOf.get(row.practiceId) ?? { id: row.practiceId, code: '', name: '' }, ...amounts(row) }))
      .sort(byTotal)
      .map(({ total: _total, ...row }) => row),
  }
}
