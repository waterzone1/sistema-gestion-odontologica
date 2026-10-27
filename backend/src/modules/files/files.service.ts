import { createHash, randomUUID } from 'node:crypto'
import type { Readable } from 'node:stream'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { recordAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { findPatientOrFail, writableProfile } from '../clinical/clinical.access.js'
import { detectMime, extensionMatches, sanitizeFilename, type AllowedMime } from './domain/fileType.js'
import { discardFile, openFile, storageKeyFor, storeFile, type FileStorageConfig } from './files.storage.js'
import type { ClinicalFileDto, UploadFileQuery } from './files.schemas.js'

const include = { professional: { select: { id: true, user: { select: { displayName: true } } } } } as const
type FileRecord = Prisma.ClinicalFileGetPayload<{ include: typeof include }>

const EXTENSION: Record<AllowedMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

function toDto(file: FileRecord): ClinicalFileDto {
  return {
    id: file.id,
    filename: file.filename,
    mimeType: file.mimeType as AllowedMime,
    size: file.size,
    category: file.category,
    description: file.description,
    clinicalEntryId: file.clinicalEntryId,
    professional: { id: file.professional.id, displayName: file.professional.user.displayName },
    createdAt: file.createdAt.toISOString(),
    archived: file.archivedAt !== null,
  }
}

export async function uploadFile(
  db: Db,
  storage: FileStorageConfig,
  actor: AuthContext,
  patientId: string,
  query: UploadFileQuery,
  content: Buffer,
): Promise<ClinicalFileDto> {
  if (content.length === 0) throw new AppError(422, 'EMPTY_FILE', 'El archivo está vacío')
  const mime = detectMime(content)
  if (!mime) throw new AppError(415, 'UNSUPPORTED_FILE', 'Solo se aceptan archivos PDF, JPG o PNG')
  const cleaned = sanitizeFilename(query.filename)
  const filename = extensionMatches(cleaned, mime) ? cleaned : `${cleaned}.${EXTENSION[mime]}`

  const professional = await writableProfile(db, actor, patientId)
  if (query.clinicalEntryId) {
    const entry = await db.clinicalEntry.findFirst({ where: { id: query.clinicalEntryId, patientId } })
    if (!entry) throw new AppError(422, 'INVALID_CLINICAL_ENTRY', 'La nota clínica no corresponde a este paciente')
  }

  const id = randomUUID()
  const key = storageKeyFor(id, new Date())
  await storeFile(storage, key, content)
  try {
    return await db.$transaction(async (tx) => {
      const file = await tx.clinicalFile.create({
        data: {
          id,
          patientId,
          professionalId: professional.id,
          clinicalEntryId: query.clinicalEntryId ?? null,
          category: query.category,
          filename,
          mimeType: mime,
          size: content.length,
          sha256: createHash('sha256').update(content).digest('hex'),
          storageKey: key,
          description: query.description,
        },
        include,
      })
      await recordAudit(tx, {
        action: 'CLINICAL_FILE_UPLOADED',
        entityType: 'ClinicalFile',
        entityId: file.id,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        metadata: { patientId, categoria: query.category, bytes: content.length },
      })
      return toDto(file)
    })
  } catch (error) {
    await discardFile(storage, key)
    throw error
  }
}

export async function listFiles(
  db: Db,
  actor: AuthContext,
  patientId: string,
  archived: boolean,
): Promise<ClinicalFileDto[]> {
  await findPatientOrFail(db, actor, patientId)
  const files = await db.clinicalFile.findMany({
    where: { patientId, ...(archived ? {} : { archivedAt: null }) },
    include,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  return files.map(toDto)
}

async function findFileOrFail(db: Pick<Db, 'patient' | 'clinicalFile'>, actor: AuthContext, patientId: string, fileId: string) {
  await findPatientOrFail(db, actor, patientId)
  const file = await db.clinicalFile.findFirst({ where: { id: fileId, patientId }, include })
  if (!file) throw new AppError(404, 'NOT_FOUND', 'El archivo no existe')
  return file
}

export async function downloadFile(
  db: Db,
  storage: FileStorageConfig,
  actor: AuthContext,
  patientId: string,
  fileId: string,
): Promise<{ file: ClinicalFileDto; stream: Readable }> {
  const file = await db.$transaction(async (tx) => {
    const found = await findFileOrFail(tx, actor, patientId, fileId)
    await recordAudit(tx, {
      action: 'CLINICAL_FILE_DOWNLOADED',
      entityType: 'ClinicalFile',
      entityId: fileId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { patientId },
    })
    return found
  })
  return { file: toDto(file), stream: openFile(storage, file.storageKey) }
}

export async function archiveFile(
  db: Db,
  actor: AuthContext,
  patientId: string,
  fileId: string,
): Promise<ClinicalFileDto> {
  return db.$transaction(async (tx) => {
    await writableProfile(tx, actor, patientId)
    const file = await findFileOrFail(tx, actor, patientId, fileId)
    if (file.archivedAt) return toDto(file)
    const archived = await tx.clinicalFile.update({
      where: { id: fileId },
      data: { archivedAt: new Date(), archivedById: actor.userId },
      include,
    })
    await recordAudit(tx, {
      action: 'CLINICAL_FILE_ARCHIVED',
      entityType: 'ClinicalFile',
      entityId: fileId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { patientId },
    })
    return toDto(archived)
  })
}
