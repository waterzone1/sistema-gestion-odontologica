import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { recordAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { findPatientOrFail, writableProfile } from './clinical.access.js'
import type {
  ClinicalEntryDto,
  ClinicalProfileDto,
  SaveClinicalProfileInput,
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

export async function listEntries(db: Db, actor: AuthContext, patientId: string): Promise<ClinicalEntryDto[]> {
  return db.$transaction(async (tx) => {
    await findPatientOrFail(tx, actor, patientId)
    await recordAudit(tx, {
      action: 'CLINICAL_HISTORY_VIEWED',
      entityType: 'Patient',
      entityId: patientId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
    })
    const entries = await tx.clinicalEntry.findMany({
      where: { patientId },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return entries.map(toDto)
  })
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

export async function getProfile(db: Db, actor: AuthContext, patientId: string): Promise<ClinicalProfileDto> {
  return db.$transaction(async (tx) => {
    await findPatientOrFail(tx, actor, patientId)
    const [latest, versions] = [
      await tx.clinicalProfile.findFirst({
        where: { patientId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { professional: { select: { id: true, user: { select: { displayName: true } } } } },
      }),
      await tx.clinicalProfile.count({ where: { patientId } }),
    ]
    await recordAudit(tx, {
      action: 'CLINICAL_PROFILE_VIEWED',
      entityType: 'Patient',
      entityId: patientId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
    })
    return {
      current: latest
        ? {
            alerts: latest.alerts,
            allergies: latest.allergies,
            medications: latest.medications,
            background: latest.background,
            professional: { id: latest.professional.id, displayName: latest.professional.user.displayName },
            updatedAt: latest.createdAt.toISOString(),
          }
        : null,
      versions,
    }
  })
}

export async function saveProfile(
  db: Db,
  actor: AuthContext,
  patientId: string,
  input: SaveClinicalProfileInput,
): Promise<ClinicalProfileDto> {
  await db.$transaction(async (tx) => {
    const professional = await writableProfile(tx, actor, patientId)
    const version = await tx.clinicalProfile.create({ data: { patientId, professionalId: professional.id, ...input } })
    await recordAudit(tx, {
      action: 'CLINICAL_PROFILE_UPDATED',
      entityType: 'ClinicalProfile',
      entityId: version.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { patientId },
    })
  })
  return getProfile(db, actor, patientId)
}
