import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { isUniqueViolation } from '../../shared/prismaErrors.js'
import { recordActorAudit, type AuditEntry } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { organizationTimeZone } from '../availability/availability.service.js'
import { dayOf, isoDay, localDayRange } from '../availability/domain/availability.js'
import { cents } from '../billing/billing.mapping.js'
import { fromCents, sum, toCents } from '../billing/domain/balance.js'
import { patientName } from '../patients/domain/name.js'
import { toCsv } from '../../shared/csv.js'
import type {
  CreateLiquidationInput,
  LiquidationDto,
  LiquidationSummaryDto,
  PayLiquidationInput,
  ResolveItemInput,
} from './liquidations.schemas.js'

type Tx = Prisma.TransactionClient

const summaryInclude = {
  provider: { select: { id: true, name: true } },
  createdBy: { select: { displayName: true } },
  items: { select: { status: true, claimedAmount: true, approvedAmount: true } },
} satisfies Prisma.LiquidationInclude

const detailInclude = {
  provider: { select: { id: true, name: true } },
  createdBy: { select: { displayName: true } },
  items: {
    include: {
      service: {
        select: {
          id: true,
          performedAt: true,
          authorizationCode: true,
          patient: { select: { id: true, firstName: true, lastName: true, documentNumber: true } },
          practice: { select: { code: true, name: true } },
          patientCoverage: { select: { affiliateNumber: true, plan: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ service: { performedAt: 'asc' } }, { id: 'asc' }],
  },
} satisfies Prisma.LiquidationInclude

type SummaryRecord = Prisma.LiquidationGetPayload<{ include: typeof summaryInclude }>
type DetailRecord = Prisma.LiquidationGetPayload<{ include: typeof detailInclude }>

function toSummary(liquidation: SummaryRecord | DetailRecord): LiquidationSummaryDto {
  const items = liquidation.items
  const approved = sum(items.map((i) => (i.approvedAmount ? cents(i.approvedAmount) : 0)))
  const debited = sum(
    items.filter((i) => i.status === 'DEBITED').map((i) => cents(i.claimedAmount) - cents(i.approvedAmount ?? i.claimedAmount)),
  )
  return {
    id: liquidation.id,
    provider: liquidation.provider,
    periodFrom: isoDay(liquidation.periodFrom),
    periodTo: isoDay(liquidation.periodTo),
    status: liquidation.status,
    createdBy: liquidation.createdBy.displayName,
    createdAt: liquidation.createdAt.toISOString(),
    submittedAt: liquidation.submittedAt?.toISOString() ?? null,
    paidAt: liquidation.paidAt?.toISOString() ?? null,
    paidAmount: liquidation.paidAmount?.toFixed(2) ?? null,
    paymentReference: liquidation.paymentReference,
    cancelReason: liquidation.cancelReason,
    totals: {
      items: items.length,
      pending: items.filter((i) => i.status === 'PENDING').length,
      claimed: fromCents(sum(items.map((i) => cents(i.claimedAmount)))),
      approved: fromCents(approved),
      rejected: fromCents(sum(items.filter((i) => i.status === 'REJECTED').map((i) => cents(i.claimedAmount)))),
      debited: fromCents(debited),
    },
  }
}

function toDetail(liquidation: DetailRecord): LiquidationDto {
  return {
    ...toSummary(liquidation),
    items: liquidation.items.map((item) => ({
      id: item.id,
      status: item.status,
      claimedAmount: item.claimedAmount.toFixed(2),
      approvedAmount: item.approvedAmount?.toFixed(2) ?? null,
      reason: item.reason,
      service: {
        id: item.service.id,
        performedAt: item.service.performedAt.toISOString(),
        patient: { id: item.service.patient.id, fullName: patientName(item.service.patient) },
        practice: item.service.practice,
        plan: item.service.patientCoverage?.plan.name ?? '',
        affiliateNumber: item.service.patientCoverage?.affiliateNumber ?? '',
        authorizationCode: item.service.authorizationCode,
      },
    })),
  }
}

function audit(tx: Tx, actor: AuthContext, entry: Pick<AuditEntry, 'action' | 'entityId' | 'metadata'>) {
  return recordActorAudit(tx, actor, { ...entry, entityType: 'Liquidation' })
}

async function stateOrFail(tx: Tx, actor: AuthContext, id: string, allowed: readonly string[], message: string) {
  const liquidation = await tx.liquidation.findFirst({
    where: { id, organizationId: actor.organizationId },
    select: { status: true, items: { select: { id: true, status: true, claimedAmount: true } } },
  })
  if (!liquidation) throw new AppError(404, 'NOT_FOUND', 'La liquidación no existe')
  if (!allowed.includes(liquidation.status)) throw new AppError(409, 'INVALID_LIQUIDATION_STATUS', message)
  return liquidation
}

async function findOrFail(tx: Pick<Db, 'liquidation'>, actor: AuthContext, id: string): Promise<DetailRecord> {
  const liquidation = await tx.liquidation.findFirst({ where: { id, organizationId: actor.organizationId }, include: detailInclude })
  if (!liquidation) throw new AppError(404, 'NOT_FOUND', 'La liquidación no existe')
  return liquidation
}

export async function listLiquidations(db: Db, actor: AuthContext): Promise<LiquidationSummaryDto[]> {
  const liquidations = await db.liquidation.findMany({
    where: { organizationId: actor.organizationId },
    include: summaryInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 200,
  })
  return liquidations.map(toSummary)
}

export async function getLiquidation(db: Db, actor: AuthContext, id: string): Promise<LiquidationDto> {
  return toDetail(await findOrFail(db, actor, id))
}

export async function createLiquidation(db: Db, actor: AuthContext, input: CreateLiquidationInput): Promise<LiquidationDto> {
  const timeZone = await organizationTimeZone(db, actor.organizationId)
  try {
    return await db.$transaction(async (tx) => {
      const provider = await tx.coverageProvider.findFirst({ where: { id: input.providerId, organizationId: actor.organizationId } })
      if (!provider) throw new AppError(422, 'INVALID_PROVIDER', 'La cobertura no existe')
      const services = await tx.performedService.findMany({
        where: {
          organizationId: actor.organizationId,
          voidedAt: null,
          coverageAmount: { gt: 0 },
          patientCoverage: { plan: { providerId: provider.id } },
          performedAt: localDayRange(input.periodFrom, input.periodTo, timeZone),
          liquidationItems: { none: { active: true } },
        },
        select: { id: true, coverageAmount: true },
        orderBy: { performedAt: 'asc' },
      })
      if (services.length === 0) {
        throw new AppError(422, 'EMPTY_LIQUIDATION', 'No hay prestaciones de esa cobertura pendientes de liquidar en el período')
      }
      const liquidation = await tx.liquidation.create({
        data: {
          organizationId: actor.organizationId,
          providerId: provider.id,
          periodFrom: dayOf(input.periodFrom),
          periodTo: dayOf(input.periodTo),
          createdById: actor.userId,
          items: { create: services.map((service) => ({ serviceId: service.id, claimedAmount: service.coverageAmount })) },
        },
      })
      await audit(tx, actor, { action: 'LIQUIDATION_CREATED', entityId: liquidation.id, metadata: { items: services.length } })
      return toDetail(await findOrFail(tx, actor, liquidation.id))
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'ALREADY_IN_LIQUIDATION', 'Otra liquidación tomó alguna de esas prestaciones: volvé a intentar')
    }
    throw err
  }
}

export async function submitLiquidation(db: Db, actor: AuthContext, id: string): Promise<LiquidationDto> {
  return db.$transaction(async (tx) => {
    await stateOrFail(tx, actor, id, ['DRAFT'], 'Solo se presenta una liquidación en borrador')
    await tx.liquidation.update({ where: { id }, data: { status: 'SUBMITTED', submittedAt: new Date() } })
    await audit(tx, actor, { action: 'LIQUIDATION_SUBMITTED', entityId: id })
    return toDetail(await findOrFail(tx, actor, id))
  })
}

export async function resolveItem(
  db: Db,
  actor: AuthContext,
  id: string,
  itemId: string,
  input: ResolveItemInput,
): Promise<LiquidationDto> {
  try {
    return await db.$transaction(async (tx) => {
      const liquidation = await stateOrFail(tx, actor, id, ['SUBMITTED'], 'Solo se registra el resultado de una liquidación presentada')
      const item = liquidation.items.find((i) => i.id === itemId)
      if (!item) throw new AppError(404, 'NOT_FOUND', 'El ítem no existe')
      const claimed = cents(item.claimedAmount)
      if (input.status === 'DEBITED' && toCents(input.approvedAmount) >= claimed) {
        throw new AppError(422, 'INVALID_DEBIT', 'Con débito, lo aprobado tiene que ser menor a lo reclamado')
      }
      const approved = input.status === 'APPROVED' ? claimed : input.status === 'DEBITED' ? toCents(input.approvedAmount) : 0
      await tx.liquidationItem.update({
        where: { id: itemId },
        data: {
          status: input.status,
          approvedAmount: fromCents(approved),
          reason: input.status === 'APPROVED' ? null : input.reason,
          active: input.status !== 'REJECTED',
        },
      })
      await audit(tx, actor, {
        action: 'LIQUIDATION_ITEM_RESOLVED',
        entityId: id,
        metadata: { itemId, estado: input.status, aprobado: fromCents(approved) },
      })
      return toDetail(await findOrFail(tx, actor, id))
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'ALREADY_IN_LIQUIDATION', 'Esa prestación ya se volvió a presentar en otra liquidación')
    }
    throw err
  }
}

export async function payLiquidation(db: Db, actor: AuthContext, id: string, input: PayLiquidationInput): Promise<LiquidationDto> {
  return db.$transaction(async (tx) => {
    const liquidation = await stateOrFail(tx, actor, id, ['SUBMITTED'], 'Solo se registra el pago de una liquidación presentada')
    if (liquidation.items.some((i) => i.status === 'PENDING')) {
      throw new AppError(422, 'ITEMS_PENDING', 'Registrá el resultado de todas las prestaciones antes del pago')
    }
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date()
    if (paidAt.getTime() > Date.now() + 5 * 60_000) throw new AppError(422, 'FUTURE_DATE', 'La fecha del pago no puede ser futura')
    const paidAmount = fromCents(toCents(input.amount))
    await tx.liquidation.update({ where: { id }, data: { status: 'PAID', paidAt, paidAmount, paymentReference: input.reference } })
    await audit(tx, actor, { action: 'LIQUIDATION_PAID', entityId: id, metadata: { importe: paidAmount } })
    return toDetail(await findOrFail(tx, actor, id))
  })
}

export async function cancelLiquidation(db: Db, actor: AuthContext, id: string, reason: string): Promise<LiquidationDto> {
  return db.$transaction(async (tx) => {
    const liquidation = await stateOrFail(tx, actor, id, ['DRAFT', 'SUBMITTED'], 'La liquidación ya está pagada o anulada')
    if (liquidation.items.some((i) => i.status !== 'PENDING')) {
      throw new AppError(422, 'ITEMS_RESOLVED', 'Ya tiene resultados registrados: no se puede anular')
    }
    await tx.liquidationItem.updateMany({ where: { liquidationId: id }, data: { active: false } })
    await tx.liquidation.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } })
    await audit(tx, actor, { action: 'LIQUIDATION_CANCELLED', entityId: id, metadata: { motivo: reason } })
    return toDetail(await findOrFail(tx, actor, id))
  })
}

const ITEM_STATUS_TEXT = { PENDING: 'Pendiente', APPROVED: 'Aprobada', DEBITED: 'Debitada', REJECTED: 'Rechazada' } as const

const csvMoney = (value: Prisma.Decimal) => value.toFixed(2).replace('.', ',')

export async function exportLiquidation(db: Db, actor: AuthContext, id: string): Promise<{ filename: string; content: string }> {
  return db.$transaction(async (tx) => {
    const liquidation = await findOrFail(tx, actor, id)
    const timeZone = await organizationTimeZone(tx, actor.organizationId)
    const day = new Intl.DateTimeFormat('es-AR', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' })
    const header = ['Fecha', 'Paciente', 'Documento', 'Plan', 'Afiliado', 'Código', 'Práctica', 'Autorización', 'Reclamado', 'Estado', 'Aprobado', 'Motivo']
    const rows = liquidation.items.map((item) => [
      day.format(item.service.performedAt),
      patientName(item.service.patient),
      item.service.patient.documentNumber ?? '',
      item.service.patientCoverage?.plan.name ?? '',
      item.service.patientCoverage?.affiliateNumber ?? '',
      item.service.practice.code,
      item.service.practice.name,
      item.service.authorizationCode ?? '',
      csvMoney(item.claimedAmount),
      ITEM_STATUS_TEXT[item.status],
      item.approvedAmount ? csvMoney(item.approvedAmount) : '',
      item.reason ?? '',
    ])
    await audit(tx, actor, { action: 'LIQUIDATION_EXPORTED', entityId: id })
    const content = toCsv([header, ...rows])
    const slug = liquidation.provider.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    return { filename: `liquidacion-${slug || 'cobertura'}-${isoDay(liquidation.periodFrom)}.csv`, content }
  })
}
