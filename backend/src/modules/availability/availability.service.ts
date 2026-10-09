import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { recordAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { availabilityProblem, expandRules, rulesProblem, type Rule } from './domain/availability.js'
import type {
  AgendaAvailabilityDto,
  AgendaAvailabilityQuery,
  AvailabilityExceptionDto,
  CreateExceptionInput,
  ExceptionResultDto,
  ProfessionalAvailabilityDto,
  ReplaceRulesInput,
} from './availability.schemas.js'

type Tx = Prisma.TransactionClient
type ExceptionRecord = NonNullable<Awaited<ReturnType<Db['availabilityException']['findFirst']>>>

const HISTORY_DAYS = 30
const DAY_MS = 86_400_000

const pad = (value: number) => String(value).padStart(2, '0')
const toTime = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
const toMinute = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number) as [number, number]
  return hours * 60 + minutes
}

function toExceptionDto(exception: ExceptionRecord): AvailabilityExceptionDto {
  return {
    id: exception.id,
    type: exception.type,
    branchId: exception.branchId,
    startsAt: exception.startsAt.toISOString(),
    endsAt: exception.endsAt.toISOString(),
    reason: exception.reason,
  }
}

export async function organizationTimeZone(db: Pick<Db, 'organization'>, organizationId: string): Promise<string> {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } })
  return organization.timezone
}

async function findProfessionalOrFail(db: Pick<Db, 'professionalProfile'>, actor: AuthContext, professionalId: string) {
  const professional = await db.professionalProfile.findFirst({
    where: { id: professionalId, user: { organizationId: actor.organizationId } },
    include: { user: { select: { branches: { select: { branchId: true } } } } },
  })
  if (!professional) throw new AppError(404, 'NOT_FOUND', 'El profesional no existe')
  return { ...professional, branchIds: professional.user.branches.map((b) => b.branchId) }
}

const activeExceptionsWhere = (professionalId: string, from: Date, to: Date) => ({
  professionalId,
  revokedAt: null,
  startsAt: { lt: to },
  endsAt: { gt: from },
})

export async function getProfessionalAvailability(
  db: Db,
  actor: AuthContext,
  professionalId: string,
): Promise<ProfessionalAvailabilityDto> {
  await findProfessionalOrFail(db, actor, professionalId)
  const since = new Date(Date.now() - HISTORY_DAYS * DAY_MS)
  const [rules, exceptions] = await Promise.all([
    db.availabilityRule.findMany({
      where: { professionalId },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    }),
    db.availabilityException.findMany({
      where: { professionalId, revokedAt: null, endsAt: { gt: since } },
      orderBy: { startsAt: 'asc' },
    }),
  ])
  return {
    rules: rules.map((rule) => ({
      id: rule.id,
      branchId: rule.branchId,
      weekday: rule.weekday,
      start: toTime(rule.startMinute),
      end: toTime(rule.endMinute),
    })),
    exceptions: exceptions.map(toExceptionDto),
  }
}

export async function replaceRules(
  db: Db,
  actor: AuthContext,
  professionalId: string,
  input: ReplaceRulesInput,
): Promise<ProfessionalAvailabilityDto> {
  const rules: Rule[] = input.rules.map((rule) => ({
    branchId: rule.branchId,
    weekday: rule.weekday,
    startMinute: toMinute(rule.start),
    endMinute: toMinute(rule.end),
  }))
  const problem = rulesProblem(rules)
  if (problem) throw new AppError(422, 'INVALID_AVAILABILITY', problem)

  await db.$transaction(async (tx) => {
    const professional = await findProfessionalOrFail(tx, actor, professionalId)
    if (rules.some((rule) => !professional.branchIds.includes(rule.branchId))) {
      throw new AppError(422, 'PROFESSIONAL_NOT_IN_BRANCH', 'El profesional no trabaja en alguna de las sedes elegidas')
    }
    await tx.availabilityRule.deleteMany({ where: { professionalId } })
    await tx.availabilityRule.createMany({ data: rules.map((rule) => ({ ...rule, professionalId })) })
    await recordAudit(tx, {
      action: 'AVAILABILITY_RULES_CHANGED',
      entityType: 'ProfessionalProfile',
      entityId: professionalId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { franjas: rules.length },
    })
  })
  return getProfessionalAvailability(db, actor, professionalId)
}

export async function createException(
  db: Db,
  actor: AuthContext,
  professionalId: string,
  input: CreateExceptionInput,
): Promise<ExceptionResultDto> {
  const startsAt = new Date(input.startsAt)
  const endsAt = new Date(input.endsAt)
  return db.$transaction(async (tx) => {
    const professional = await findProfessionalOrFail(tx, actor, professionalId)
    const branchId = input.branchId ?? null
    if (branchId && !professional.branchIds.includes(branchId)) {
      throw new AppError(422, 'PROFESSIONAL_NOT_IN_BRANCH', 'El profesional no trabaja en esa sede')
    }
    const exception = await tx.availabilityException.create({
      data: { professionalId, branchId, type: input.type, startsAt, endsAt, reason: input.reason, createdById: actor.userId },
    })
    await recordAudit(tx, {
      action: 'AVAILABILITY_EXCEPTION_CREATED',
      entityType: 'AvailabilityException',
      entityId: exception.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { professionalId, tipo: input.type },
    })
    const conflicts =
      input.type === 'EXTRA'
        ? []
        : await tx.appointment.findMany({
            where: {
              professionalId,
              organizationId: actor.organizationId,
              status: { in: ['SCHEDULED', 'CONFIRMED'] },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
              ...(branchId ? { branchId } : {}),
            },
            select: { id: true, startsAt: true, patient: { select: { firstName: true, lastName: true } } },
            orderBy: { startsAt: 'asc' },
          })
    return {
      exception: toExceptionDto(exception),
      conflicts: conflicts.map((a) => ({
        id: a.id,
        startsAt: a.startsAt.toISOString(),
        patient: `${a.patient.lastName}, ${a.patient.firstName}`,
      })),
    }
  })
}

export async function revokeException(
  db: Db,
  actor: AuthContext,
  professionalId: string,
  exceptionId: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await findProfessionalOrFail(tx, actor, professionalId)
    const exception = await tx.availabilityException.findFirst({ where: { id: exceptionId, professionalId } })
    if (!exception) throw new AppError(404, 'NOT_FOUND', 'La excepción no existe')
    if (exception.revokedAt) return
    await tx.availabilityException.update({
      where: { id: exceptionId },
      data: { revokedAt: new Date(), revokedById: actor.userId },
    })
    await recordAudit(tx, {
      action: 'AVAILABILITY_EXCEPTION_REVOKED',
      entityType: 'AvailabilityException',
      entityId: exceptionId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { professionalId },
    })
  })
}

export async function agendaAvailability(
  db: Db,
  actor: AuthContext,
  query: AgendaAvailabilityQuery,
): Promise<AgendaAvailabilityDto> {
  const from = new Date(query.from)
  const to = new Date(query.to)
  const timeZone = await organizationTimeZone(db, actor.organizationId)
  const professionals = await db.professionalProfile.findMany({
    where: {
      active: true,
      user: { organizationId: actor.organizationId, active: true, branches: { some: { branchId: query.branchId } } },
      ...(query.professionalId ? { id: query.professionalId } : {}),
    },
    select: {
      id: true,
      availabilityRules: { where: { branchId: query.branchId } },
      availabilityExceptions: {
        where: {
          revokedAt: null,
          startsAt: { lt: to },
          endsAt: { gt: from },
          OR: [{ branchId: null }, { branchId: query.branchId }],
        },
      },
    },
  })
  return professionals.map((professional) => ({
    professionalId: professional.id,
    available: [
      ...expandRules(professional.availabilityRules, from, to, timeZone),
      ...professional.availabilityExceptions
        .filter((e) => e.type === 'EXTRA')
        .map((e) => ({ start: e.startsAt, end: e.endsAt, branchId: e.branchId as string })),
    ].map((i) => ({ start: i.start.toISOString(), end: i.end.toISOString(), branchId: i.branchId })),
    blocked: professional.availabilityExceptions
      .filter((e) => e.type !== 'EXTRA')
      .map((e) => ({
        start: e.startsAt.toISOString(),
        end: e.endsAt.toISOString(),
        branchId: e.branchId,
        type: e.type,
        reason: e.reason,
      })),
  }))
}

interface Slot {
  professionalId: string
  branchId: string
  startsAt: Date
  endsAt: Date
}

export async function assertAvailable(tx: Tx, organizationId: string, slot: Slot): Promise<void> {
  const [timeZone, rules, exceptions] = await Promise.all([
    organizationTimeZone(tx, organizationId),
    tx.availabilityRule.findMany({ where: { professionalId: slot.professionalId } }),
    tx.availabilityException.findMany({
      where: activeExceptionsWhere(slot.professionalId, slot.startsAt, slot.endsAt),
    }),
  ])
  const problem = availabilityProblem({ ...slot, rules, exceptions, timeZone })
  if (problem) throw new AppError(422, 'OUTSIDE_AVAILABILITY', problem)
}
