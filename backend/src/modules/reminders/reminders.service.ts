import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { recordActorAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { organizationTimeZone } from '../availability/availability.service.js'
import { addDays, dayOf, isoDay, localDayRange, minuteToTime, toLocal } from '../availability/domain/availability.js'
import { localDay } from '../billing/domain/balance.js'
import { transitionStatus } from '../appointments/appointments.service.js'
import { patientName } from '../patients/domain/name.js'
import { readSettings, renderTemplate } from '../organizations/domain/settings.js'
import { whatsappLink, whatsappNumber } from './domain/message.js'
import type { ReminderDto, RemindersDayDto } from './reminders.schemas.js'

const include = {
  appointment: {
    select: {
      id: true,
      status: true,
      startsAt: true,
      professional: { select: { user: { select: { displayName: true } } } },
      branch: { select: { name: true } },
    },
  },
  patient: { select: { id: true, firstName: true, lastName: true, phone: true, phoneHasWhatsapp: true } },
} satisfies Prisma.ReminderInclude

type ReminderRecord = Prisma.ReminderGetPayload<{ include: typeof include }>

const NO_PHONE = 'El paciente no tiene un celular válido cargado'
const NO_WHATSAPP = 'El paciente no usa WhatsApp: avisale por llamada'

function contactOf(reminder: ReminderRecord) {
  const unsent = reminder.status === 'PENDING' || reminder.status === 'FAILED'
  const phone = unsent ? reminder.patient.phone : reminder.phone
  const reachable = whatsappNumber(phone) !== null
  return {
    phone,
    status: unsent ? (reachable ? 'PENDING' : 'FAILED') : reminder.status,
    whatsapp: reachable && reminder.patient.phoneHasWhatsapp,
    failureReason: unsent ? (!reachable ? NO_PHONE : reminder.patient.phoneHasWhatsapp ? null : NO_WHATSAPP) : reminder.failureReason,
  } as const
}

function toDto(reminder: ReminderRecord, timeZone: string): ReminderDto {
  const moved = localDay(reminder.appointment.startsAt, timeZone) !== isoDay(reminder.scheduledFor)
  const cancelled = reminder.status !== 'CONFIRMED' && (reminder.appointment.status === 'CANCELLED' || moved)
  const contact = contactOf(reminder)
  return {
    id: reminder.id,
    status: cancelled ? 'CANCELLED' : contact.status,
    phone: contact.phone,
    message: reminder.message,
    whatsappUrl: cancelled || contact.status === 'FAILED' || !contact.whatsapp ? null : whatsappLink(contact.phone, reminder.message),
    failureReason: moved && reminder.status !== 'CONFIRMED' ? 'El turno se reprogramó: generá el recordatorio del día nuevo' : contact.failureReason,
    sentAt: reminder.sentAt?.toISOString() ?? null,
    confirmedAt: reminder.confirmedAt?.toISOString() ?? null,
    patient: { id: reminder.patient.id, fullName: patientName(reminder.patient) },
    appointment: {
      id: reminder.appointment.id,
      status: reminder.appointment.status,
      startsAt: reminder.appointment.startsAt.toISOString(),
      professional: reminder.appointment.professional.user.displayName,
      branch: reminder.appointment.branch.name,
    },
  }
}

export async function generateReminders(db: Db, actor: AuthContext, day?: string): Promise<RemindersDayDto> {
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: actor.organizationId },
    select: { name: true, timezone: true, settings: true },
  })
  const settings = readSettings(organization.settings).reminders
  const target = day ?? addDays(localDay(new Date(), organization.timezone), settings.daysAhead)
  const appointments = await db.appointment.findMany({
    where: {
      organizationId: actor.organizationId,
      startsAt: localDayRange(target, target, organization.timezone),
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      reminders: { none: { scheduledFor: dayOf(target) } },
      patient: { archivedAt: null },
    },
    include: {
      patient: { select: { id: true, firstName: true, phone: true } },
      professional: { select: { user: { select: { displayName: true } } } },
      branch: { select: { name: true } },
    },
  })
  if (appointments.length > 0) {
    await db.$transaction(async (tx) => {
      await tx.reminder.createMany({
        data: appointments.map((appointment) => {
          const local = toLocal(appointment.startsAt, organization.timezone)
          const [year, month, date] = local.day.split('-')
          const message = renderTemplate(settings.template, {
            nombre: appointment.patient.firstName,
            fecha: `${date}/${month}/${year}`,
            hora: minuteToTime(local.minute),
            profesional: appointment.professional.user.displayName,
            sede: appointment.branch.name,
            consultorio: organization.name,
          })
          const valid = whatsappNumber(appointment.patient.phone) !== null
          return {
            organizationId: actor.organizationId,
            appointmentId: appointment.id,
            patientId: appointment.patient.id,
            phone: appointment.patient.phone,
            message,
            scheduledFor: dayOf(target),
            ...(valid ? {} : { status: 'FAILED' as const, failureReason: NO_PHONE }),
          }
        }),
        skipDuplicates: true,
      })
      await recordActorAudit(tx, actor, {
        action: 'REMINDERS_GENERATED',
        entityType: 'Reminder',
        metadata: { dia: target, cantidad: appointments.length },
      })
    })
  }
  return listReminders(db, actor, target)
}

export async function listReminders(db: Db, actor: AuthContext, day: string): Promise<RemindersDayDto> {
  const reminders = await db.reminder.findMany({
    where: { organizationId: actor.organizationId, scheduledFor: dayOf(day) },
    include,
    orderBy: [{ appointment: { startsAt: 'asc' } }, { id: 'asc' }],
  })
  const timeZone = await organizationTimeZone(db, actor.organizationId)
  return { date: day, reminders: reminders.map((reminder) => toDto(reminder, timeZone)) }
}

async function findOrFail(tx: Pick<Db, 'reminder'>, actor: AuthContext, id: string) {
  const reminder = await tx.reminder.findFirst({ where: { id, organizationId: actor.organizationId }, include })
  if (!reminder) throw new AppError(404, 'NOT_FOUND', 'El recordatorio no existe')
  return reminder
}

async function dtoOf(tx: Pick<Db, 'organization'>, actor: AuthContext, reminder: ReminderRecord) {
  return toDto(reminder, await organizationTimeZone(tx, actor.organizationId))
}

export async function markSent(db: Db, actor: AuthContext, id: string): Promise<ReminderDto> {
  return db.$transaction(async (tx) => {
    const reminder = await findOrFail(tx, actor, id)
    const contact = contactOf(reminder)
    if (contact.status !== 'PENDING' && contact.status !== 'SENT') {
      throw new AppError(409, 'INVALID_REMINDER_STATUS', 'Ese recordatorio ya no se puede enviar')
    }
    const updated = await tx.reminder.update({
      where: { id },
      data: { status: 'SENT', phone: contact.phone, failureReason: null, sentAt: reminder.sentAt ?? new Date(), sentById: actor.userId },
      include,
    })
    return dtoOf(tx, actor, updated)
  })
}

export async function markConfirmed(db: Db, actor: AuthContext, id: string): Promise<ReminderDto> {
  return db.$transaction(async (tx) => {
    const reminder = await findOrFail(tx, actor, id)
    if (reminder.appointment.status !== 'SCHEDULED' && reminder.appointment.status !== 'CONFIRMED') {
      throw new AppError(409, 'INVALID_REMINDER_STATUS', 'El turno ya no está pendiente')
    }
    if (reminder.appointment.status === 'SCHEDULED') {
      await transitionStatus(tx, actor, reminder.appointment.id, { status: 'CONFIRMED' }, { porRecordatorio: true })
    }
    const updated = await tx.reminder.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: new Date() }, include })
    return dtoOf(tx, actor, updated)
  })
}

export async function cancelReminder(db: Db, actor: AuthContext, id: string): Promise<ReminderDto> {
  return db.$transaction(async (tx) => {
    const reminder = await findOrFail(tx, actor, id)
    if (reminder.status === 'CONFIRMED') throw new AppError(409, 'INVALID_REMINDER_STATUS', 'El paciente ya confirmó')
    const updated = await tx.reminder.update({ where: { id }, data: { status: 'CANCELLED' }, include })
    return dtoOf(tx, actor, updated)
  })
}
