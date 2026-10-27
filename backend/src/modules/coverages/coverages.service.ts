import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { isExclusionViolation, isUniqueViolation } from '../../shared/prismaErrors.js'
import { recordActorAudit as audit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { organizationTimeZone } from '../availability/availability.service.js'
import { dayOf, isoDay } from '../availability/domain/availability.js'
import { localDay } from '../billing/domain/balance.js'
import { findPatientOrFail } from '../clinical/clinical.access.js'
import { hasPermission } from '../users/domain/permissions.js'
import type {
  AgreementDto,
  CoverageQuoteDto,
  CreateAgreementInput,
  CreatePatientCoverageInput,
  CreatePlanInput,
  CreateProviderInput,
  PatientCoverageDto,
  ProviderDto,
  UpdateAgreementInput,
  UpdatePlanInput,
  UpdateProviderInput,
} from './coverages.schemas.js'

type Tx = Prisma.TransactionClient

const providerInclude = { plans: { orderBy: { name: 'asc' } } } satisfies Prisma.CoverageProviderInclude

function toProviderDto(provider: Prisma.CoverageProviderGetPayload<{ include: typeof providerInclude }>): ProviderDto {
  return {
    id: provider.id,
    name: provider.name,
    kind: provider.kind,
    active: provider.active,
    plans: provider.plans.map((plan) => ({ id: plan.id, name: plan.name, code: plan.code, active: plan.active })),
  }
}

function duplicateName(err: unknown): never {
  if (isUniqueViolation(err)) throw new AppError(409, 'DUPLICATE_NAME', 'Ya existe uno con ese nombre')
  throw err
}

export async function listProviders(db: Db, actor: AuthContext): Promise<ProviderDto[]> {
  const providers = await db.coverageProvider.findMany({
    where: { organizationId: actor.organizationId },
    include: providerInclude,
    orderBy: { name: 'asc' },
  })
  return providers.map(toProviderDto)
}

async function findProviderOrFail(db: Pick<Db, 'coverageProvider'>, actor: AuthContext, id: string) {
  const provider = await db.coverageProvider.findFirst({ where: { id, organizationId: actor.organizationId }, include: providerInclude })
  if (!provider) throw new AppError(404, 'NOT_FOUND', 'La cobertura no existe')
  return provider
}

async function findPlanOrFail(db: Pick<Db, 'coveragePlan'>, actor: AuthContext, id: string) {
  const plan = await db.coveragePlan.findFirst({ where: { id, provider: { organizationId: actor.organizationId } } })
  if (!plan) throw new AppError(404, 'NOT_FOUND', 'El plan no existe')
  return plan
}

export async function createProvider(db: Db, actor: AuthContext, input: CreateProviderInput): Promise<ProviderDto> {
  return db
    .$transaction(async (tx) => {
      const provider = await tx.coverageProvider.create({
        data: { organizationId: actor.organizationId, name: input.name, kind: input.kind },
        include: providerInclude,
      })
      await audit(tx, actor, { action: 'COVERAGE_SAVED', entityType: 'CoverageProvider', entityId: provider.id })
      return toProviderDto(provider)
    })
    .catch(duplicateName)
}

export async function updateProvider(db: Db, actor: AuthContext, id: string, input: UpdateProviderInput): Promise<ProviderDto> {
  return db
    .$transaction(async (tx) => {
      await findProviderOrFail(tx, actor, id)
      const provider = await tx.coverageProvider.update({ where: { id }, data: input, include: providerInclude })
      await audit(tx, actor, { action: 'COVERAGE_SAVED', entityType: 'CoverageProvider', entityId: id, metadata: { campos: Object.keys(input) } })
      return toProviderDto(provider)
    })
    .catch(duplicateName)
}

export async function createPlan(db: Db, actor: AuthContext, providerId: string, input: CreatePlanInput): Promise<ProviderDto> {
  return db
    .$transaction(async (tx) => {
      await findProviderOrFail(tx, actor, providerId)
      const plan = await tx.coveragePlan.create({ data: { providerId, name: input.name, code: input.code } })
      await audit(tx, actor, { action: 'COVERAGE_SAVED', entityType: 'CoveragePlan', entityId: plan.id })
      return toProviderDto(await findProviderOrFail(tx, actor, providerId))
    })
    .catch(duplicateName)
}

export async function updatePlan(db: Db, actor: AuthContext, id: string, input: UpdatePlanInput): Promise<ProviderDto> {
  return db
    .$transaction(async (tx) => {
      const plan = await findPlanOrFail(tx, actor, id)
      await tx.coveragePlan.update({ where: { id }, data: input })
      await audit(tx, actor, { action: 'COVERAGE_SAVED', entityType: 'CoveragePlan', entityId: id, metadata: { campos: Object.keys(input) } })
      return toProviderDto(await findProviderOrFail(tx, actor, plan.providerId))
    })
    .catch(duplicateName)
}

const agreementInclude = {
  items: { include: { practice: { select: { id: true, code: true, name: true } } }, orderBy: { practice: { name: 'asc' } } },
} satisfies Prisma.AgreementInclude

function toAgreementDto(agreement: Prisma.AgreementGetPayload<{ include: typeof agreementInclude }>): AgreementDto {
  return {
    id: agreement.id,
    planId: agreement.planId,
    validFrom: isoDay(agreement.validFrom),
    validTo: agreement.validTo ? isoDay(agreement.validTo) : null,
    notes: agreement.notes,
    items: agreement.items.map((item) => ({
      practice: item.practice,
      insurerAmount: item.insurerAmount.toFixed(2),
      patientCopay: item.patientCopay.toFixed(2),
      requiresAuthorization: item.requiresAuthorization,
    })),
  }
}

function overlapping(err: unknown): never {
  if (isExclusionViolation(err)) {
    throw new AppError(409, 'AGREEMENT_OVERLAP', 'Ya hay un convenio vigente para ese plan en esas fechas')
  }
  throw err
}

async function assertPractices(tx: Tx, actor: AuthContext, items: { practiceId: string }[]) {
  const found = await tx.practice.count({ where: { id: { in: items.map((i) => i.practiceId) }, organizationId: actor.organizationId } })
  if (found !== items.length) throw new AppError(422, 'INVALID_PRACTICE', 'Alguna práctica no existe')
}

export async function listAgreements(db: Db, actor: AuthContext, planId: string): Promise<AgreementDto[]> {
  await findPlanOrFail(db, actor, planId)
  const agreements = await db.agreement.findMany({ where: { planId }, include: agreementInclude, orderBy: { validFrom: 'desc' } })
  return agreements.map(toAgreementDto)
}

export async function createAgreement(db: Db, actor: AuthContext, planId: string, input: CreateAgreementInput): Promise<AgreementDto> {
  return db
    .$transaction(async (tx) => {
      await findPlanOrFail(tx, actor, planId)
      await assertPractices(tx, actor, input.items)
      const agreement = await tx.agreement.create({
        data: {
          planId,
          validFrom: dayOf(input.validFrom),
          validTo: input.validTo ? dayOf(input.validTo) : null,
          notes: input.notes,
          items: { create: input.items },
        },
        include: agreementInclude,
      })
      await audit(tx, actor, { action: 'AGREEMENT_SAVED', entityType: 'Agreement', entityId: agreement.id, metadata: { planId } })
      return toAgreementDto(agreement)
    })
    .catch(overlapping)
}

export async function updateAgreement(db: Db, actor: AuthContext, id: string, input: UpdateAgreementInput): Promise<AgreementDto> {
  return db
    .$transaction(async (tx) => {
      const current = await tx.agreement.findFirst({ where: { id, plan: { provider: { organizationId: actor.organizationId } } } })
      if (!current) throw new AppError(404, 'NOT_FOUND', 'El convenio no existe')
      if (input.validTo && dayOf(input.validTo) < current.validFrom) {
        throw new AppError(422, 'INVALID_VALIDITY', 'La vigencia tiene que terminar después de empezar')
      }
      if (input.items) {
        await assertPractices(tx, actor, input.items)
        await tx.agreementItem.deleteMany({ where: { agreementId: id } })
        await tx.agreementItem.createMany({ data: input.items.map((item) => ({ ...item, agreementId: id })) })
      }
      const agreement = await tx.agreement.update({
        where: { id },
        data: {
          ...(input.validTo !== undefined ? { validTo: input.validTo ? dayOf(input.validTo) : null } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
        include: agreementInclude,
      })
      await audit(tx, actor, { action: 'AGREEMENT_SAVED', entityType: 'Agreement', entityId: id, metadata: { campos: Object.keys(input) } })
      return toAgreementDto(agreement)
    })
    .catch(overlapping)
}

const coverageInclude = {
  plan: { select: { id: true, name: true, provider: { select: { id: true, name: true, kind: true } } } },
} satisfies Prisma.PatientCoverageInclude

type CoverageRecord = Prisma.PatientCoverageGetPayload<{ include: typeof coverageInclude }>

function toCoverageDto(coverage: CoverageRecord): PatientCoverageDto {
  return {
    id: coverage.id,
    provider: coverage.plan.provider,
    plan: { id: coverage.plan.id, name: coverage.plan.name },
    affiliateNumber: coverage.affiliateNumber,
    validFrom: isoDay(coverage.validFrom),
    validTo: coverage.validTo ? isoDay(coverage.validTo) : null,
    notes: coverage.notes,
    primary: coverage.primary,
    archived: coverage.archivedAt !== null,
    createdAt: coverage.createdAt.toISOString(),
  }
}

export async function listPatientCoverages(db: Db, actor: AuthContext, patientId: string): Promise<PatientCoverageDto[]> {
  await findPatientOrFail(db, actor, patientId)
  const coverages = await db.patientCoverage.findMany({
    where: { patientId },
    include: coverageInclude,
    orderBy: [{ archivedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
  })
  return coverages.map(toCoverageDto)
}

export async function addPatientCoverage(
  db: Db,
  actor: AuthContext,
  patientId: string,
  input: CreatePatientCoverageInput,
): Promise<PatientCoverageDto> {
  return db.$transaction(async (tx) => {
    const patient = await findPatientOrFail(tx, actor, patientId)
    if (patient.archivedAt) throw new AppError(422, 'PATIENT_ARCHIVED', 'El paciente está archivado')
    const plan = await tx.coveragePlan.findFirst({
      where: { id: input.planId, active: true, provider: { organizationId: actor.organizationId, active: true } },
    })
    if (!plan) throw new AppError(422, 'INVALID_PLAN', 'El plan no existe o está inactivo')
    if (input.primary) {
      const previous = await tx.patientCoverage.findFirst({ where: { patientId, primary: true, archivedAt: null } })
      if (previous) {
        await tx.patientCoverage.update({ where: { id: previous.id }, data: { archivedAt: new Date() } })
        await audit(tx, actor, { action: 'PATIENT_COVERAGE_ARCHIVED', entityType: 'PatientCoverage', entityId: previous.id, metadata: { patientId, reemplazada: true } })
      }
    }
    const coverage = await tx.patientCoverage.create({
      data: {
        patientId,
        planId: plan.id,
        affiliateNumber: input.affiliateNumber,
        validFrom: dayOf(input.validFrom),
        validTo: input.validTo ? dayOf(input.validTo) : null,
        notes: input.notes,
        primary: input.primary,
      },
      include: coverageInclude,
    })
    await audit(tx, actor, { action: 'PATIENT_COVERAGE_SAVED', entityType: 'PatientCoverage', entityId: coverage.id, metadata: { patientId } })
    return toCoverageDto(coverage)
  })
}

export async function archivePatientCoverage(db: Db, actor: AuthContext, patientId: string, coverageId: string): Promise<PatientCoverageDto> {
  return db.$transaction(async (tx) => {
    await findPatientOrFail(tx, actor, patientId)
    const coverage = await tx.patientCoverage.findFirst({ where: { id: coverageId, patientId }, include: coverageInclude })
    if (!coverage) throw new AppError(404, 'NOT_FOUND', 'La cobertura no existe')
    if (coverage.archivedAt) return toCoverageDto(coverage)
    const archived = await tx.patientCoverage.update({ where: { id: coverageId }, data: { archivedAt: new Date() }, include: coverageInclude })
    await audit(tx, actor, { action: 'PATIENT_COVERAGE_ARCHIVED', entityType: 'PatientCoverage', entityId: coverageId, metadata: { patientId } })
    return toCoverageDto(archived)
  })
}

export interface ResolvedCoverage {
  coverage: CoverageRecord
  insurerAmount: Prisma.Decimal
  patientCopay: Prisma.Decimal
  requiresAuthorization: boolean
}

export async function resolveCoverage(
  db: Pick<Db, 'patientCoverage' | 'agreementItem'>,
  patientId: string,
  practiceId: string,
  day: string,
): Promise<ResolvedCoverage | null> {
  const date = dayOf(day)
  const coverage = await db.patientCoverage.findFirst({
    where: {
      patientId,
      primary: true,
      archivedAt: null,
      validFrom: { lte: date },
      OR: [{ validTo: null }, { validTo: { gte: date } }],
      plan: { active: true, provider: { active: true } },
    },
    include: coverageInclude,
  })
  if (!coverage) return null
  const item = await db.agreementItem.findFirst({
    where: {
      practiceId,
      agreement: { planId: coverage.planId, validFrom: { lte: date }, OR: [{ validTo: null }, { validTo: { gte: date } }] },
    },
  })
  if (!item) return null
  return { coverage, insurerAmount: item.insurerAmount, patientCopay: item.patientCopay, requiresAuthorization: item.requiresAuthorization }
}

export async function quoteCoverage(
  db: Db,
  actor: AuthContext,
  patientId: string,
  practiceId: string,
  date: string | undefined,
): Promise<CoverageQuoteDto> {
  const [, timeZone] = await Promise.all([findPatientOrFail(db, actor, patientId), organizationTimeZone(db, actor.organizationId)])
  const day = date ?? localDay(new Date(), timeZone)
  const resolved = await resolveCoverage(db, patientId, practiceId, day)
  if (!resolved) return { coverage: null, insurerAmount: null, patientCopay: null, requiresAuthorization: false }
  const amounts = hasPermission(actor.permissions, 'account:read')
  const dto = toCoverageDto(resolved.coverage)
  return {
    coverage: { id: dto.id, provider: dto.provider, plan: dto.plan, affiliateNumber: dto.affiliateNumber },
    insurerAmount: amounts ? resolved.insurerAmount.toFixed(2) : null,
    patientCopay: amounts ? resolved.patientCopay.toFixed(2) : null,
    requiresAuthorization: resolved.requiresAuthorization,
  }
}
