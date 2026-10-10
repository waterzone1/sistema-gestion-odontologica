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

async function load(db: Pick<Db, 'toothFinding'>, patientId: string): Promise<OdontogramDto> {
  const findings = await db.toothFinding.findMany({
    where: { patientId },
    include,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  return { current: currentState(findings).map(toDto), history: findings.map(toDto) }
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
