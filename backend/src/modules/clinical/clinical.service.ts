import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { recordAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import type {
  ClinicalEntryDto,
  CorrectClinicalEntryInput,
  CreateClinicalEntryInput,
} from './clinical.schemas.js'

const include = {
  professional: { select: { id: true, user: { select: { displayName: true } } } },
} as const

type EntryRecord = Prisma.ClinicalEntryGetPayload<{ include: typeof include }>

function toDto(entry: EntryRecord): ClinicalEntryDto {
  return {
    id: entry.id,
    entryType: entry.entryType,
    content: entry.content,
    correctionOfId: entry.correctionOfId,
    appointmentId: entry.appointmentId,
    professional: { id: entry.professional.id, displayName: entry.professional.user.displayName },
    createdAt: entry.createdAt.toISOString(),
  }
}

async function findPatientOrFail(db: Pick<Db, 'patient'>, actor: AuthContext, patientId: string) {
  const patient = await db.patient.findFirst({ where: { id: patientId, organizationId: actor.organizationId } })
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'El paciente no existe')
  return patient
}

async function writableProfile(db: Pick<Db, 'patient' | 'professionalProfile'>, actor: AuthContext, patientId: string) {
  const patient = await findPatientOrFail(db, actor, patientId)
  if (patient.archivedAt) {
    throw new AppError(422, 'PATIENT_ARCHIVED', 'El paciente está archivado: reactivalo para registrar notas')
  }
  const profile = await db.professionalProfile.findFirst({
    where: { userId: actor.userId, active: true, user: { organizationId: actor.organizationId } },
  })
  if (!profile) {
    throw new AppError(422, 'PROFESSIONAL_PROFILE_REQUIRED', 'Tu usuario no tiene un perfil profesional activo')
  }
  return profile
}

export async function listEntries(db: Db, actor: AuthContext, patientId: string): Promise<ClinicalEntryDto[]> {
  await findPatientOrFail(db, actor, patientId)
  const [entries] = await db.$transaction([
    db.clinicalEntry.findMany({
      where: { patientId },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    db.auditLog.create({
      data: {
        action: 'CLINICAL_HISTORY_VIEWED',
        entityType: 'Patient',
        entityId: patientId,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
      },
    }),
  ])
  return entries.map(toDto)
}

export async function createEntry(
  db: Db,
  actor: AuthContext,
  patientId: string,
  input: CreateClinicalEntryInput,
): Promise<ClinicalEntryDto> {
  return db.$transaction(async (tx) => {
    const profile = await writableProfile(tx, actor, patientId)
    if (input.appointmentId) {
      const appointment = await tx.appointment.findFirst({
        where: {
          id: input.appointmentId,
          patientId,
          professionalId: profile.id,
          organizationId: actor.organizationId,
        },
      })
      if (!appointment) {
        throw new AppError(422, 'INVALID_APPOINTMENT', 'El turno no corresponde a este paciente y profesional')
      }
    }
    const entry = await tx.clinicalEntry.create({
      data: {
        patientId,
        professionalId: profile.id,
        appointmentId: input.appointmentId ?? null,
        entryType: 'EVOLUTION',
        content: input.content,
      },
      include,
    })
    await recordAudit(tx, {
      action: 'CLINICAL_ENTRY_CREATED',
      entityType: 'ClinicalEntry',
      entityId: entry.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { patientId },
    })
    return toDto(entry)
  })
}

export async function correctEntry(
  db: Db,
  actor: AuthContext,
  patientId: string,
  entryId: string,
  input: CorrectClinicalEntryInput,
): Promise<ClinicalEntryDto> {
  return db.$transaction(async (tx) => {
    const profile = await writableProfile(tx, actor, patientId)
    const original = await tx.clinicalEntry.findFirst({ where: { id: entryId, patientId } })
    if (!original) throw new AppError(404, 'NOT_FOUND', 'La nota no existe')
    if (original.entryType === 'CORRECTION') {
      throw new AppError(422, 'CANNOT_CORRECT_CORRECTION', 'Corregí la nota original, no la corrección')
    }
    const entry = await tx.clinicalEntry.create({
      data: {
        patientId,
        professionalId: profile.id,
        appointmentId: original.appointmentId,
        entryType: 'CORRECTION',
        content: input.content,
        correctionOfId: original.id,
      },
      include,
    })
    await recordAudit(tx, {
      action: 'CLINICAL_ENTRY_CORRECTED',
      entityType: 'ClinicalEntry',
      entityId: entry.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { patientId, correctionOfId: original.id },
    })
    return toDto(entry)
  })
}
