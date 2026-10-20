import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { recordAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { findPatientOrFail, writableProfile } from '../clinical/clinical.access.js'
import { currentState, findingProblem } from './domain/fdi.js'
import type { OdontogramDto, RecordFindingInput, ToothFindingDto } from './odontogram.schemas.js'

const include = { professional: { select: { id: true, user: { select: { displayName: true } } } } } as const
type FindingRecord = Prisma.ToothFindingGetPayload<{ include: typeof include }>

function toDto(finding: FindingRecord): ToothFindingDto {
  return {
    id: finding.id,
    tooth: finding.tooth,
    surface: finding.surface,
    condition: finding.condition,
    note: finding.note,
    professional: { id: finding.professional.id, displayName: finding.professional.user.displayName },
    createdAt: finding.createdAt.toISOString(),
  }
}

const professionalName = { select: { user: { select: { displayName: true } } } } as const

function performedEntry(
  source: { id: string; tooth: number | null; surfaces: OdontogramDto['performed'][number]['surfaces']; practice: { name: string } },
  date: Date,
  professional: { user: { displayName: string } },
) {
  return {
    id: source.id,
    tooth: source.tooth as number,
    surfaces: source.surfaces,
    practice: source.practice.name,
    status: 'COMPLETED' as const,
    date: date.toISOString(),
    professional: professional.user.displayName,
  }
}

async function load(db: Pick<Db, 'toothFinding' | 'treatmentItem' | 'performedService'>, patientId: string): Promise<OdontogramDto> {
  const findings = await db.toothFinding.findMany({
    where: { patientId },
    include,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  const items = await db.treatmentItem.findMany({
    where: { tooth: { not: null }, status: { in: ['PLANNED', 'IN_PROGRESS', 'COMPLETED'] }, plan: { patientId } },
    include: {
      practice: { select: { name: true } },
      plan: { select: { professional: professionalName } },
      services: { where: { voidedAt: null }, select: { performedAt: true }, orderBy: { performedAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  })
  const services = await db.performedService.findMany({
    where: { patientId, tooth: { not: null }, voidedAt: null, treatmentItemId: null },
    include: { practice: { select: { name: true } }, professional: professionalName },
    orderBy: { performedAt: 'desc' },
  })
  const open = items.filter((item) => item.status !== 'COMPLETED')
  const done = items.filter((item) => item.status === 'COMPLETED')
  return {
    current: currentState(findings).map(toDto),
    history: findings.map(toDto),
    planned: open.map((item) => ({
      id: item.id,
      tooth: item.tooth as number,
      surfaces: item.surfaces,
      practice: item.practice.name,
      status: item.status,
      date: item.createdAt.toISOString(),
      professional: item.plan.professional.user.displayName,
    })),
    performed: [
      ...done.map((item) =>
        performedEntry(item, item.completedAt ?? item.services[0]?.performedAt ?? item.updatedAt, item.plan.professional),
      ),
      ...services.map((service) => performedEntry(service, service.performedAt, service.professional)),
    ].sort((a, b) => b.date.localeCompare(a.date)),
  }
}

export async function getOdontogram(db: Db, actor: AuthContext, patientId: string): Promise<OdontogramDto> {
  await findPatientOrFail(db, actor, patientId)
  return load(db, patientId)
}

export async function recordFinding(
  db: Db,
  actor: AuthContext,
  patientId: string,
  input: RecordFindingInput,
): Promise<OdontogramDto> {
  const problem = findingProblem(input.tooth, input.condition, input.surfaces)
  if (problem) throw new AppError(422, 'INVALID_FINDING', problem)
  return db.$transaction(async (tx) => {
    const professional = await writableProfile(tx, actor, patientId)
    const surfaces = input.surfaces.length > 0 ? input.surfaces : [null]
    for (const surface of surfaces) {
      await tx.toothFinding.create({
        data: {
          patientId,
          professionalId: professional.id,
          tooth: input.tooth,
          surface,
          condition: input.condition,
          note: input.note,
        },
      })
    }
    await recordAudit(tx, {
      action: 'ODONTOGRAM_UPDATED',
      entityType: 'Patient',
      entityId: patientId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { pieza: input.tooth },
    })
    return load(tx, patientId)
  })
}
