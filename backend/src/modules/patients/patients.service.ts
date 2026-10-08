import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { isUniqueViolation } from '../../shared/prismaErrors.js'
import { recordAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { documentProblem } from './domain/document.js'
import { buildSearchText, escapeLike, searchTokens } from './domain/search.js'
import type {
  CreatePatientInput,
  ListPatientsQuery,
  PatientDto,
  UpdatePatientInput,
} from './patients.schemas.js'

type PatientRecord = NonNullable<Awaited<ReturnType<Db['patient']['findFirst']>>>

function toPatientDto(patient: PatientRecord): PatientDto {
  return {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    documentType: patient.documentType,
    documentNumber: patient.documentNumber,
    birthDate: patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : null,
    phone: patient.phone,
    email: patient.email,
    address: patient.address,
    emergencyContact: patient.emergencyContact,
    archivedAt: patient.archivedAt ? patient.archivedAt.toISOString() : null,
    createdAt: patient.createdAt.toISOString(),
  }
}

async function findPatientOrFail(
  db: Pick<Db, 'patient'>,
  organizationId: string,
  id: string,
): Promise<PatientRecord> {
  const patient = await db.patient.findFirst({ where: { id, organizationId } })
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'El paciente no existe')
  return patient
}

function assertDocument(type: PatientRecord['documentType'], number: string | null): void {
  const problem = documentProblem(type, number)
  if (problem) throw new AppError(422, 'INVALID_DOCUMENT', problem)
}

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  return value === null ? null : new Date(`${value}T00:00:00.000Z`)
}

async function duplicateError(
  db: Pick<Db, 'patient'>,
  organizationId: string,
  documentType: PatientRecord['documentType'],
  documentNumber: string | null,
) {
  const existing = await db.patient.findFirst({
    where: { organizationId, documentType, documentNumber },
  })
  return new AppError(409, 'DUPLICATE_PATIENT', 'Ya existe un paciente con ese documento', {
    patientId: existing?.id ?? null,
    fullName: existing ? `${existing.lastName}, ${existing.firstName}` : null,
    archived: existing ? existing.archivedAt !== null : false,
  })
}

export async function listPatients(db: Db, actor: AuthContext, query: ListPatientsQuery) {
  const where: Prisma.PatientWhereInput = {
    organizationId: actor.organizationId,
    ...(query.status === 'active' ? { archivedAt: null } : {}),
    ...(query.status === 'archived' ? { archivedAt: { not: null } } : {}),
    AND: searchTokens(query.q ?? '').map((token) => ({ searchText: { contains: escapeLike(token) } })),
  }
  const [items, total] = await Promise.all([
    db.patient.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.patient.count({ where }),
  ])
  return { items: items.map(toPatientDto), total, page: query.page, pageSize: query.pageSize }
}

export async function getPatient(db: Db, actor: AuthContext, id: string): Promise<PatientDto> {
  return toPatientDto(await findPatientOrFail(db, actor.organizationId, id))
}

export async function createPatient(
  db: Db,
  actor: AuthContext,
  input: CreatePatientInput,
): Promise<PatientDto> {
  const documentNumber = input.documentNumber ?? null
  assertDocument(input.documentType, documentNumber)
  const phone = input.phone ?? null

  try {
    return await db.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: {
          organizationId: actor.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          documentType: input.documentType,
          documentNumber,
          birthDate: toDate(input.birthDate) ?? null,
          phone,
          email: input.email ?? null,
          address: input.address ?? null,
          emergencyContact: input.emergencyContact ?? null,
          searchText: buildSearchText({
            firstName: input.firstName,
            lastName: input.lastName,
            documentNumber,
            phone,
          }),
        },
      })
      await recordAudit(tx, {
        action: 'PATIENT_CREATED',
        entityType: 'Patient',
        entityId: patient.id,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
      })
      return toPatientDto(patient)
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw await duplicateError(db, actor.organizationId, input.documentType, documentNumber)
    }
    throw err
  }
}

export async function updatePatient(
  db: Db,
  actor: AuthContext,
  id: string,
  input: UpdatePatientInput,
): Promise<PatientDto> {
  let attempted: { type: PatientRecord['documentType']; number: string | null } | null = null
  try {
    return await db.$transaction(async (tx) => {
      const current = await findPatientOrFail(tx, actor.organizationId, id)
      const documentType = input.documentType ?? current.documentType
      const documentNumber =
        input.documentNumber !== undefined ? input.documentNumber : current.documentNumber
      attempted = { type: documentType, number: documentNumber }
      assertDocument(documentType, documentNumber)

      const firstName = input.firstName ?? current.firstName
      const lastName = input.lastName ?? current.lastName
      const phone = input.phone !== undefined ? input.phone : current.phone

      const updated = await tx.patient.update({
        where: { id },
        data: {
          firstName,
          lastName,
          documentType,
          documentNumber,
          phone,
          ...(input.birthDate !== undefined ? { birthDate: toDate(input.birthDate) } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.emergencyContact !== undefined
            ? { emergencyContact: input.emergencyContact }
            : {}),
          searchText: buildSearchText({ firstName, lastName, documentNumber, phone }),
        },
      })
      await recordAudit(tx, {
        action: 'PATIENT_UPDATED',
        entityType: 'Patient',
        entityId: id,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        metadata: { campos: Object.keys(input) },
      })
      return toPatientDto(updated)
    })
  } catch (err) {
    const target = attempted as { type: PatientRecord['documentType']; number: string | null } | null
    if (isUniqueViolation(err) && target) {
      throw await duplicateError(db, actor.organizationId, target.type, target.number)
    }
    throw err
  }
}

export async function setPatientArchived(
  db: Db,
  actor: AuthContext,
  id: string,
  archived: boolean,
): Promise<PatientDto> {
  return db.$transaction(async (tx) => {
    const current = await findPatientOrFail(tx, actor.organizationId, id)
    if ((current.archivedAt !== null) === archived) return toPatientDto(current)
    const updated = await tx.patient.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    })
    await recordAudit(tx, {
      action: archived ? 'PATIENT_ARCHIVED' : 'PATIENT_UNARCHIVED',
      entityType: 'Patient',
      entityId: id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
    })
    return toPatientDto(updated)
  })
}
