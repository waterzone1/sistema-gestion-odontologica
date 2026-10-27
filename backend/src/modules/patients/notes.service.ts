import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { recordAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { findPatientOrFail } from '../clinical/clinical.access.js'
import type { CreateNoteInput, PatientNoteDto } from './notes.schemas.js'

const include = { author: { select: { id: true, displayName: true } } } as const

type NoteRecord = Prisma.PatientNoteGetPayload<{ include: typeof include }>

function toDto(note: NoteRecord): PatientNoteDto {
  return {
    id: note.id,
    content: note.content,
    author: note.author,
    createdAt: note.createdAt.toISOString(),
    archivedAt: note.archivedAt ? note.archivedAt.toISOString() : null,
  }
}

export async function listNotes(
  db: Db,
  actor: AuthContext,
  patientId: string,
  archived: boolean,
): Promise<PatientNoteDto[]> {
  await findPatientOrFail(db, actor, patientId)
  const notes = await db.patientNote.findMany({
    where: { patientId, ...(archived ? {} : { archivedAt: null }) },
    include,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  return notes.map(toDto)
}

export async function createNote(
  db: Db,
  actor: AuthContext,
  patientId: string,
  input: CreateNoteInput,
): Promise<PatientNoteDto> {
  return db.$transaction(async (tx) => {
    const patient = await findPatientOrFail(tx, actor, patientId)
    if (patient.archivedAt) {
      throw new AppError(422, 'PATIENT_ARCHIVED', 'El paciente está archivado: reactivalo para dejarle mensajes')
    }
    const note = await tx.patientNote.create({
      data: { patientId, authorId: actor.userId, content: input.content },
      include,
    })
    await recordAudit(tx, {
      action: 'PATIENT_NOTE_CREATED',
      entityType: 'PatientNote',
      entityId: note.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { patientId },
    })
    return toDto(note)
  })
}

export async function archiveNote(
  db: Db,
  actor: AuthContext,
  patientId: string,
  noteId: string,
): Promise<PatientNoteDto> {
  return db.$transaction(async (tx) => {
    await findPatientOrFail(tx, actor, patientId)
    const note = await tx.patientNote.findFirst({ where: { id: noteId, patientId }, include })
    if (!note) throw new AppError(404, 'NOT_FOUND', 'El mensaje no existe')
    if (note.archivedAt) return toDto(note)
    const archived = await tx.patientNote.update({
      where: { id: noteId },
      data: { archivedAt: new Date(), archivedById: actor.userId },
      include,
    })
    await recordAudit(tx, {
      action: 'PATIENT_NOTE_ARCHIVED',
      entityType: 'PatientNote',
      entityId: noteId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { patientId },
    })
    return toDto(archived)
  })
}
