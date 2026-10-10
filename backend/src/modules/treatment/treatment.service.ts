import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { recordAudit, type AuditEntry } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { fromCents, toCents } from '../billing/domain/balance.js'
import { findPatientOrFail, writableProfile } from '../clinical/clinical.access.js'
import { findingProblem } from '../odontogram/domain/fdi.js'
import { hasPermission } from '../users/domain/permissions.js'
import type { AddItemInput, CreatePlanInput, TreatmentPlanDto } from './treatment.schemas.js'

const include = {
  professional: { select: { id: true, user: { select: { displayName: true } } } },
  items: {
    include: { practice: { select: { id: true, code: true, name: true, basePrice: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.TreatmentPlanInclude

type PlanRecord = Prisma.TreatmentPlanGetPayload<{ include: typeof include }>
type Tx = Prisma.TransactionClient

const ACTIVE_ITEM = ['PLANNED', 'IN_PROGRESS'] as const

function toDto(plan: PlanRecord, actor: AuthContext): TreatmentPlanDto {
  const clinical = hasPermission(actor.permissions, 'clinical:read')
  const amounts = hasPermission(actor.permissions, 'account:read')
  const live = plan.items.filter((item) => item.status !== 'CANCELLED')
  const total = live.reduce((sum, item) => sum + (item.agreedPrice ? toCents(item.agreedPrice.toFixed(2)) : 0), 0)
  return {
    id: plan.id,
    title: plan.title,
    status: plan.status,
    professional: { id: plan.professional.id, displayName: plan.professional.user.displayName },
    acceptedAt: plan.acceptedAt?.toISOString() ?? null,
    total: amounts ? fromCents(total) : null,
    createdAt: plan.createdAt.toISOString(),
    items: plan.items.map((item) => ({
      id: item.id,
      practice: { id: item.practice.id, code: item.practice.code, name: item.practice.name },
      tooth: clinical ? item.tooth : null,
      surfaces: clinical ? item.surfaces : [],
      notes: clinical ? item.notes : null,
      agreedPrice: amounts && item.agreedPrice ? item.agreedPrice.toFixed(2) : null,
      catalogPrice: amounts ? item.practice.basePrice.toFixed(2) : null,
      priced: item.agreedPrice !== null,
      status: item.status,
      cancelReason: item.cancelReason,
    })),
  }
}

async function audit(tx: Tx, actor: AuthContext, entry: Pick<AuditEntry, 'action' | 'entityType' | 'entityId' | 'metadata'>) {
  await recordAudit(tx, { ...entry, organizationId: actor.organizationId, actorUserId: actor.userId })
}

async function findPlanOrFail(tx: Pick<Db, 'patient' | 'treatmentPlan'>, actor: AuthContext, patientId: string, planId: string) {
  await findPatientOrFail(tx, actor, patientId)
  const plan = await tx.treatmentPlan.findFirst({
    where: { id: planId, patientId, organizationId: actor.organizationId },
    include,
  })
  if (!plan) throw new AppError(404, 'NOT_FOUND', 'El plan de tratamiento no existe')
  return plan
}

function findItemOrFail(plan: PlanRecord, itemId: string) {
  const item = plan.items.find((i) => i.id === itemId)
  if (!item) throw new AppError(404, 'NOT_FOUND', 'El ítem no existe')
  return item
}

function assertOpen(plan: PlanRecord) {
  if (plan.status === 'COMPLETED' || plan.status === 'CANCELLED') {
    throw new AppError(409, 'PLAN_CLOSED', 'El plan está cerrado')
  }
}

export async function syncPlanStatus(tx: Tx, planId: string): Promise<void> {
  const plan = await tx.treatmentPlan.findUniqueOrThrow({ where: { id: planId }, include: { items: true } })
  const live = plan.items.filter((item) => item.status !== 'CANCELLED')
  const status =
    live.length === 0 && plan.items.length > 0
      ? 'CANCELLED'
      : live.length > 0 && live.every((item) => item.status === 'COMPLETED')
        ? 'COMPLETED'
        : plan.acceptedAt
          ? 'ACCEPTED'
          : 'DRAFT'
  if (status !== plan.status) await tx.treatmentPlan.update({ where: { id: planId }, data: { status } })
}

async function reload(tx: Tx, actor: AuthContext, patientId: string, planId: string): Promise<TreatmentPlanDto> {
  return toDto(await findPlanOrFail(tx, actor, patientId, planId), actor)
}

export async function listPlans(db: Db, actor: AuthContext, patientId: string): Promise<TreatmentPlanDto[]> {
  await findPatientOrFail(db, actor, patientId)
  const plans = await db.treatmentPlan.findMany({
    where: { patientId, organizationId: actor.organizationId },
    include,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  return plans.map((plan) => toDto(plan, actor))
}

export async function createPlan(db: Db, actor: AuthContext, patientId: string, input: CreatePlanInput) {
  return db.$transaction(async (tx) => {
    const professional = await writableProfile(tx, actor, patientId)
    const plan = await tx.treatmentPlan.create({
      data: { organizationId: actor.organizationId, patientId, professionalId: professional.id, title: input.title },
    })
    await audit(tx, actor, { action: 'TREATMENT_PLAN_CREATED', entityType: 'TreatmentPlan', entityId: plan.id, metadata: { patientId } })
    return reload(tx, actor, patientId, plan.id)
  })
}

export async function addItem(db: Db, actor: AuthContext, patientId: string, planId: string, input: AddItemInput) {
  if (input.tooth !== null && input.tooth !== undefined) {
    const problem = findingProblem(input.tooth, 'CARIES', input.surfaces)
    if (problem) throw new AppError(422, 'INVALID_TOOTH', problem)
  } else if (input.surfaces.length > 0) {
    throw new AppError(422, 'INVALID_TOOTH', 'Las superficies necesitan una pieza')
  }
  return db.$transaction(async (tx) => {
    await writableProfile(tx, actor, patientId)
    const plan = await findPlanOrFail(tx, actor, patientId, planId)
    assertOpen(plan)
    const practice = await tx.practice.findFirst({
      where: { id: input.practiceId, organizationId: actor.organizationId, active: true },
    })
    if (!practice) throw new AppError(422, 'INVALID_PRACTICE', 'La práctica no existe o está inactiva')
    const item = await tx.treatmentItem.create({
      data: { planId, practiceId: practice.id, tooth: input.tooth ?? null, surfaces: input.surfaces, notes: input.notes },
    })
    await audit(tx, actor, { action: 'TREATMENT_ITEM_ADDED', entityType: 'TreatmentItem', entityId: item.id, metadata: { planId } })
    return reload(tx, actor, patientId, planId)
  })
}

export async function priceItem(db: Db, actor: AuthContext, patientId: string, planId: string, itemId: string, price: string) {
  return db.$transaction(async (tx) => {
    const plan = await findPlanOrFail(tx, actor, patientId, planId)
    assertOpen(plan)
    const item = findItemOrFail(plan, itemId)
    if (!(ACTIVE_ITEM as readonly string[]).includes(item.status)) {
      throw new AppError(409, 'ITEM_CLOSED', 'Solo se cotizan ítems pendientes o en curso')
    }
    const agreed = fromCents(toCents(price))
    await tx.treatmentItem.update({ where: { id: itemId }, data: { agreedPrice: agreed } })
    await audit(tx, actor, {
      action: 'TREATMENT_ITEM_PRICED',
      entityType: 'TreatmentItem',
      entityId: itemId,
      metadata: { planId, before: item.agreedPrice?.toFixed(2) ?? null, after: agreed },
    })
    return reload(tx, actor, patientId, planId)
  })
}

export async function acceptPlan(db: Db, actor: AuthContext, patientId: string, planId: string) {
  return db.$transaction(async (tx) => {
    const plan = await findPlanOrFail(tx, actor, patientId, planId)
    if (plan.status !== 'DRAFT') throw new AppError(409, 'PLAN_NOT_DRAFT', 'El presupuesto ya fue aceptado o el plan está cerrado')
    const live = plan.items.filter((item) => item.status !== 'CANCELLED')
    if (live.length === 0) throw new AppError(422, 'EMPTY_PLAN', 'El plan no tiene ítems')
    if (live.some((item) => item.agreedPrice === null)) {
      throw new AppError(422, 'UNPRICED_ITEMS', 'Falta cotizar algún ítem')
    }
    await tx.treatmentPlan.update({ where: { id: planId }, data: { acceptedAt: new Date(), acceptedById: actor.userId } })
    await syncPlanStatus(tx, planId)
    await audit(tx, actor, { action: 'TREATMENT_PLAN_ACCEPTED', entityType: 'TreatmentPlan', entityId: planId, metadata: { patientId } })
    return reload(tx, actor, patientId, planId)
  })
}

export async function startItem(db: Db, actor: AuthContext, patientId: string, planId: string, itemId: string) {
  return db.$transaction(async (tx) => {
    await writableProfile(tx, actor, patientId)
    const plan = await findPlanOrFail(tx, actor, patientId, planId)
    const item = findItemOrFail(plan, itemId)
    if (item.status !== 'PLANNED') throw new AppError(409, 'ITEM_NOT_PLANNED', 'Solo se inicia un ítem pendiente')
    await tx.treatmentItem.update({ where: { id: itemId }, data: { status: 'IN_PROGRESS' } })
    return reload(tx, actor, patientId, planId)
  })
}

export async function cancelItem(
  db: Db,
  actor: AuthContext,
  patientId: string,
  planId: string,
  itemId: string,
  reason: string,
) {
  return db.$transaction(async (tx) => {
    const plan = await findPlanOrFail(tx, actor, patientId, planId)
    const item = findItemOrFail(plan, itemId)
    if (!(ACTIVE_ITEM as readonly string[]).includes(item.status)) {
      throw new AppError(409, 'ITEM_CLOSED', 'El ítem ya está terminado o cancelado')
    }
    await tx.treatmentItem.update({ where: { id: itemId }, data: { status: 'CANCELLED', cancelReason: reason } })
    await syncPlanStatus(tx, planId)
    await audit(tx, actor, { action: 'TREATMENT_ITEM_CANCELLED', entityType: 'TreatmentItem', entityId: itemId, metadata: { planId } })
    return reload(tx, actor, patientId, planId)
  })
}
