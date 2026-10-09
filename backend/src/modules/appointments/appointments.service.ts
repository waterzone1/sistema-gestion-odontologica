import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { isExclusionViolation } from '../../shared/prismaErrors.js'
import { recordAudit } from '../audit/audit.service.js'
import { assertAvailable } from '../availability/availability.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { hasPermission } from '../users/domain/permissions.js'
import {
  canTransition,
  isEditable,
  type AppointmentStatus,
} from './domain/status.js'
import { rangeProblem } from './domain/timeRange.js'
import type {
  AppointmentDto,
  ChangeStatusInput,
  CreateAppointmentInput,
  ListAppointmentsQuery,
  UpdateAppointmentInput,
} from './appointments.schemas.js'

const include = {
  branch: { select: { id: true, name: true } },
  patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
  professional: { select: { id: true, user: { select: { id: true, displayName: true } } } },
  practice: { select: { id: true, code: true, name: true } },
  _count: { select: { clinicalEntries: true } },
} as const

type AppointmentRecord = Prisma.AppointmentGetPayload<{ include: typeof include }>

function toDto(appointment: AppointmentRecord, actor: AuthContext): AppointmentDto {
  return {
    id: appointment.id,
    status: appointment.status,
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt.toISOString(),
    notes: appointment.notes,
    cancellationReason: appointment.cancellationReason,
    branch: appointment.branch,
    patient: {
      id: appointment.patient.id,
      fullName: `${appointment.patient.lastName}, ${appointment.patient.firstName}`,
      phone: appointment.patient.phone,
    },
    professional: {
      id: appointment.professional.id,
      userId: appointment.professional.user.id,
      displayName: appointment.professional.user.displayName,
    },
    practice: appointment.practice,
    hasClinicalNote: hasPermission(actor.permissions, 'clinical:read') ? appointment._count.clinicalEntries > 0 : null,
    availabilityOverride: appointment.availabilityOverride,
    overrideReason: appointment.overrideReason,
    createdAt: appointment.createdAt.toISOString(),
  }
}

function visibleWhere(actor: AuthContext): Prisma.AppointmentWhereInput {
  const isAdmin = actor.roles.includes('ADMIN')
  const manages = hasPermission(actor.permissions, 'appointments:manage')
  return {
    organizationId: actor.organizationId,
    ...(isAdmin ? {} : { branchId: { in: actor.branchIds } }),
    ...(manages ? {} : { professional: { userId: actor.userId } }),
  }
}

function assertBranchAccess(actor: AuthContext, branchId: string): void {
  if (!actor.roles.includes('ADMIN') && !actor.branchIds.includes(branchId)) {
    throw new AppError(403, 'FORBIDDEN_BRANCH', 'No trabajás en esa sede')
  }
}

function assertRange(startsAt: Date, endsAt: Date): void {
  const problem = rangeProblem(startsAt, endsAt)
  if (problem) throw new AppError(422, 'INVALID_TIME_RANGE', problem)
}

async function findVisibleOrFail(
  db: Pick<Db, 'appointment'>,
  actor: AuthContext,
  id: string,
): Promise<AppointmentRecord> {
  const appointment = await db.appointment.findFirst({
    where: { id, ...visibleWhere(actor) },
    include,
  })
  if (!appointment) throw new AppError(404, 'NOT_FOUND', 'El turno no existe')
  return appointment
}

interface References {
  patientId: string
  branchId: string
  professionalId: string
  practiceId: string | null
}

async function assertReferences(
  tx: Pick<Db, 'patient' | 'branch' | 'professionalProfile' | 'practice' | 'professionalPractice'>,
  actor: AuthContext,
  refs: References,
  checkPatient: boolean,
): Promise<void> {
  if (checkPatient) {
    const patient = await tx.patient.findFirst({
      where: { id: refs.patientId, organizationId: actor.organizationId },
    })
    if (!patient) throw new AppError(404, 'NOT_FOUND', 'El paciente no existe')
    if (patient.archivedAt) {
      throw new AppError(422, 'PATIENT_ARCHIVED', 'El paciente está archivado: reactivalo para darle turnos')
    }
  }

  const branch = await tx.branch.findFirst({
    where: { id: refs.branchId, organizationId: actor.organizationId, active: true },
  })
  if (!branch) throw new AppError(422, 'INVALID_BRANCH', 'La sede no existe o está inactiva')

  const professional = await tx.professionalProfile.findFirst({
    where: {
      id: refs.professionalId,
      active: true,
      user: { organizationId: actor.organizationId, active: true },
    },
    include: { user: { select: { branches: { select: { branchId: true } } } } },
  })
  if (!professional) {
    throw new AppError(422, 'INVALID_PROFESSIONAL', 'El profesional no existe o está inactivo')
  }
  if (!professional.user.branches.some((b) => b.branchId === refs.branchId)) {
    throw new AppError(422, 'PROFESSIONAL_NOT_IN_BRANCH', 'El profesional no atiende en esa sede')
  }

  if (refs.practiceId) {
    const practice = await tx.practice.findFirst({
      where: { id: refs.practiceId, organizationId: actor.organizationId, active: true },
    })
    if (!practice) throw new AppError(422, 'INVALID_PRACTICE', 'La práctica no existe o está inactiva')
    const offered = await tx.professionalPractice.findMany({
      where: { professionalId: refs.professionalId },
      select: { practiceId: true },
    })
    if (offered.length > 0 && !offered.some((o) => o.practiceId === refs.practiceId)) {
      throw new AppError(422, 'PRACTICE_NOT_OFFERED', 'El profesional no realiza esa práctica')
    }
  }
}

interface SlotCheck {
  professionalId: string
  branchId: string
  startsAt: Date
  endsAt: Date
  override: { reason: string } | undefined
}

async function checkAvailability(tx: Prisma.TransactionClient, actor: AuthContext, slot: SlotCheck) {
  if (!slot.override) {
    await assertAvailable(tx, actor.organizationId, slot)
    return { availabilityOverride: false, overrideReason: null }
  }
  if (!hasPermission(actor.permissions, 'appointments:override')) {
    throw new AppError(403, 'FORBIDDEN', 'Solo un administrador puede dar turnos fuera de horario')
  }
  return { availabilityOverride: true, overrideReason: slot.override.reason }
}

async function auditOverride(
  tx: Prisma.TransactionClient,
  actor: AuthContext,
  appointmentId: string,
  branchId: string,
  reason: string,
) {
  await recordAudit(tx, {
    action: 'APPOINTMENT_AVAILABILITY_OVERRIDE',
    entityType: 'Appointment',
    entityId: appointmentId,
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    branchId,
    metadata: { motivo: reason },
  })
}

async function conflictError(
  db: Pick<Db, 'appointment'>,
  professionalId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
): Promise<AppError> {
  const existing = await db.appointment.findFirst({
    where: {
      professionalId,
      status: { not: 'CANCELLED' },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, startsAt: true, endsAt: true },
  })
  return new AppError(409, 'APPOINTMENT_CONFLICT', 'El profesional ya tiene un turno en ese horario', {
    appointmentId: existing?.id ?? null,
    startsAt: existing?.startsAt.toISOString() ?? null,
    endsAt: existing?.endsAt.toISOString() ?? null,
  })
}

export async function listAppointments(
  db: Db,
  actor: AuthContext,
  query: ListAppointmentsQuery,
): Promise<AppointmentDto[]> {
  const appointments = await db.appointment.findMany({
    where: {
      ...visibleWhere(actor),
      startsAt: { lt: new Date(query.to) },
      endsAt: { gt: new Date(query.from) },
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.professionalId ? { professionalId: query.professionalId } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    include,
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    take: 1000,
  })
  return appointments.map((appointment) => toDto(appointment, actor))
}

export async function getAppointment(db: Db, actor: AuthContext, id: string): Promise<AppointmentDto> {
  return toDto(await findVisibleOrFail(db, actor, id), actor)
}

export async function createAppointment(
  db: Db,
  actor: AuthContext,
  input: CreateAppointmentInput,
): Promise<AppointmentDto> {
  const startsAt = new Date(input.startsAt)
  const endsAt = new Date(input.endsAt)
  assertRange(startsAt, endsAt)
  assertBranchAccess(actor, input.branchId)

  try {
    return await db.$transaction(async (tx) => {
      await assertReferences(tx, actor, { ...input, practiceId: input.practiceId ?? null }, true)
      const availability = await checkAvailability(tx, actor, { ...input, startsAt, endsAt, override: input.override })
      const created = await tx.appointment.create({
        data: {
          organizationId: actor.organizationId,
          branchId: input.branchId,
          patientId: input.patientId,
          professionalId: input.professionalId,
          practiceId: input.practiceId ?? null,
          startsAt,
          endsAt,
          notes: input.notes ?? null,
          createdById: actor.userId,
          ...availability,
        },
        include,
      })
      if (input.override) await auditOverride(tx, actor, created.id, input.branchId, input.override.reason)
      await recordAudit(tx, {
        action: 'APPOINTMENT_CREATED',
        entityType: 'Appointment',
        entityId: created.id,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        branchId: input.branchId,
      })
      return toDto(created, actor)
    })
  } catch (err) {
    if (isExclusionViolation(err)) {
      throw await conflictError(db, input.professionalId, startsAt, endsAt)
    }
    throw err
  }
}

export async function updateAppointment(
  db: Db,
  actor: AuthContext,
  id: string,
  input: UpdateAppointmentInput,
): Promise<AppointmentDto> {
  let attempt: { professionalId: string; startsAt: Date; endsAt: Date } | null = null
  try {
    return await db.$transaction(async (tx) => {
      const current = await findVisibleOrFail(tx, actor, id)
      if (!isEditable(current.status)) {
        throw new AppError(409, 'NOT_EDITABLE', 'Solo se pueden modificar turnos pendientes o confirmados')
      }

      const startsAt = input.startsAt ? new Date(input.startsAt) : current.startsAt
      const endsAt = input.endsAt ? new Date(input.endsAt) : current.endsAt
      const branchId = input.branchId ?? current.branch.id
      const professionalId = input.professionalId ?? current.professional.id
      const practiceId = input.practiceId !== undefined ? input.practiceId : (current.practice?.id ?? null)
      attempt = { professionalId, startsAt, endsAt }

      assertRange(startsAt, endsAt)
      assertBranchAccess(actor, branchId)
      await assertReferences(tx, actor, { patientId: current.patient.id, branchId, professionalId, practiceId }, false)

      const rescheduled =
        startsAt.getTime() !== current.startsAt.getTime() ||
        endsAt.getTime() !== current.endsAt.getTime() ||
        professionalId !== current.professional.id
      const slotChanged = rescheduled || branchId !== current.branch.id
      const availability = slotChanged
        ? await checkAvailability(tx, actor, { professionalId, branchId, startsAt, endsAt, override: input.override })
        : {}

      const updated = await tx.appointment.update({
        where: { id },
        data: {
          branchId,
          professionalId,
          practiceId,
          startsAt,
          endsAt,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(rescheduled && current.status === 'CONFIRMED' ? { status: 'SCHEDULED' } : {}),
          ...availability,
        },
        include,
      })
      if (slotChanged && input.override) await auditOverride(tx, actor, id, branchId, input.override.reason)
      await recordAudit(tx, {
        action: 'APPOINTMENT_UPDATED',
        entityType: 'Appointment',
        entityId: id,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        branchId,
        metadata: { campos: Object.keys(input).filter((campo) => campo !== 'override'), reprogramado: rescheduled },
      })
      return toDto(updated, actor)
    })
  } catch (err) {
    const tried = attempt as { professionalId: string; startsAt: Date; endsAt: Date } | null
    if (isExclusionViolation(err) && tried) {
      throw await conflictError(db, tried.professionalId, tried.startsAt, tried.endsAt, id)
    }
    throw err
  }
}

export async function changeAppointmentStatus(
  db: Db,
  actor: AuthContext,
  id: string,
  input: ChangeStatusInput,
): Promise<AppointmentDto> {
  const needsManage = input.status === 'CONFIRMED' || input.status === 'CANCELLED'
  if (needsManage && !hasPermission(actor.permissions, 'appointments:manage')) {
    throw new AppError(403, 'FORBIDDEN', 'No tenés permiso para realizar esta acción')
  }

  return db.$transaction(async (tx) => {
    const current = await findVisibleOrFail(tx, actor, id)
    const from: AppointmentStatus = current.status
    if (!canTransition(from, input.status)) {
      throw new AppError(409, 'INVALID_TRANSITION', 'El turno no puede pasar a ese estado desde el actual')
    }

    const updated = await tx.appointment.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.status === 'CANCELLED' ? { cancellationReason: input.cancellationReason ?? null } : {}),
      },
      include,
    })
    await recordAudit(tx, {
      action: 'APPOINTMENT_STATUS_CHANGED',
      entityType: 'Appointment',
      entityId: id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      branchId: current.branch.id,
      metadata: { desde: from, hacia: input.status },
    })
    return toDto(updated, actor)
  })
}
