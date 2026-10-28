import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import type { AuthContext } from '../auth/auth.types.js'
import { organizationTimeZone } from '../availability/availability.service.js'
import { addDays, fromLocal, isoDay, minuteToTime, toLocal } from '../availability/domain/availability.js'
import { patientName } from '../patients/domain/name.js'
import type { AuditListDto, AuditQuery } from './audit.schemas.js'

type Row = { entityType: string; entityId: string | null; metadata: unknown }

const idsOf = (rows: Row[], type: string) => [...new Set(rows.filter((r) => r.entityType === type && r.entityId).map((r) => r.entityId as string))]
const metaIds = (rows: Row[], key: string) => [
  ...new Set(
    rows.flatMap((r) => {
      const value = r.metadata && typeof r.metadata === 'object' ? (r.metadata as Record<string, unknown>)[key] : undefined
      return typeof value === 'string' ? [value] : []
    }),
  ),
]

const name = { select: { firstName: true, lastName: true } } as const

const loadIf = <T>(ids: string[], load: (ids: string[]) => Promise<T[]>): Promise<T[]> => (ids.length > 0 ? load(ids) : Promise.resolve([]))

async function describeSubjects(db: Db, organizationId: string, rows: Row[], timeZone: string) {
  const when = (date: Date) => {
    const local = toLocal(date, timeZone)
    const [year, month, day] = local.day.split('-')
    return `${day}/${month}/${year} ${minuteToTime(local.minute)}`
  }
  const day = (date: Date) => isoDay(date).split('-').reverse().join('/')
  const org = { organizationId }
  const [patients, appointments, services, payments, users, practices, professionals, liquidations, notes, coverages, entries, files, plans, providers, branches] =
    await Promise.all([
      loadIf([...idsOf(rows, 'Patient'), ...metaIds(rows, 'patientId')], (ids) => db.patient.findMany({ where: { ...org, id: { in: ids } }, select: { id: true, ...name.select } })),
      loadIf(idsOf(rows, 'Appointment'), (ids) => db.appointment.findMany({ where: { ...org, id: { in: ids } }, select: { id: true, startsAt: true, patient: name } })),
      loadIf(idsOf(rows, 'PerformedService'), (ids) => db.performedService.findMany({ where: { ...org, id: { in: ids } }, select: { id: true, practice: { select: { name: true } }, patient: name } })),
      loadIf(idsOf(rows, 'Payment'), (ids) => db.payment.findMany({ where: { ...org, id: { in: ids } }, select: { id: true, patient: name } })),
      loadIf([...idsOf(rows, 'User'), ...metaIds(rows, 'userId')], (ids) => db.user.findMany({ where: { ...org, id: { in: ids } }, select: { id: true, displayName: true } })),
      loadIf(idsOf(rows, 'Practice'), (ids) => db.practice.findMany({ where: { ...org, id: { in: ids } }, select: { id: true, name: true } })),
      loadIf(idsOf(rows, 'ProfessionalProfile'), (ids) => db.professionalProfile.findMany({ where: { id: { in: ids }, user: org }, select: { id: true, user: { select: { displayName: true } } } })),
      loadIf(idsOf(rows, 'Liquidation'), (ids) => db.liquidation.findMany({ where: { ...org, id: { in: ids } }, select: { id: true, periodFrom: true, periodTo: true, provider: { select: { name: true } } } })),
      loadIf(idsOf(rows, 'PatientNote'), (ids) => db.patientNote.findMany({ where: { id: { in: ids }, patient: org }, select: { id: true, patient: name } })),
      loadIf(idsOf(rows, 'PatientCoverage'), (ids) => db.patientCoverage.findMany({ where: { id: { in: ids }, patient: org }, select: { id: true, patient: name, plan: { select: { name: true, provider: { select: { name: true } } } } } })),
      loadIf(idsOf(rows, 'ClinicalEntry'), (ids) => db.clinicalEntry.findMany({ where: { id: { in: ids }, patient: org }, select: { id: true, patient: name } })),
      loadIf(idsOf(rows, 'ClinicalFile'), (ids) => db.clinicalFile.findMany({ where: { id: { in: ids }, patient: org }, select: { id: true, patient: name } })),
      loadIf(idsOf(rows, 'TreatmentPlan'), (ids) => db.treatmentPlan.findMany({ where: { ...org, id: { in: ids } }, select: { id: true, patient: name } })),
      loadIf(idsOf(rows, 'CoverageProvider'), (ids) => db.coverageProvider.findMany({ where: { ...org, id: { in: ids } }, select: { id: true, name: true } })),
      loadIf(idsOf(rows, 'Branch'), (ids) => db.branch.findMany({ where: { ...org, id: { in: ids } }, select: { id: true, name: true } })),
    ])
  const byType: Record<string, Map<string, string>> = {
    Patient: new Map(patients.map((p) => [p.id, patientName(p)])),
    Appointment: new Map(appointments.map((a) => [a.id, `Turno de ${patientName(a.patient)} del ${when(a.startsAt)}`])),
    PerformedService: new Map(services.map((s) => [s.id, `${s.practice.name} de ${patientName(s.patient)}`])),
    Payment: new Map(payments.map((p) => [p.id, `Cobro a ${patientName(p.patient)}`])),
    User: new Map(users.map((u) => [u.id, u.displayName])),
    Practice: new Map(practices.map((p) => [p.id, p.name])),
    ProfessionalProfile: new Map(professionals.map((p) => [p.id, p.user.displayName])),
    Liquidation: new Map(liquidations.map((l) => [l.id, `${l.provider.name}, ${day(l.periodFrom)} al ${day(l.periodTo)}`])),
    PatientNote: new Map(notes.map((n) => [n.id, `Mensaje sobre ${patientName(n.patient)}`])),
    PatientCoverage: new Map(coverages.map((c) => [c.id, `${c.plan.provider.name} ${c.plan.name} de ${patientName(c.patient)}`])),
    ClinicalEntry: new Map(entries.map((e) => [e.id, `Historia clínica de ${patientName(e.patient)}`])),
    ClinicalFile: new Map(files.map((f) => [f.id, `Archivo clínico de ${patientName(f.patient)}`])),
    TreatmentPlan: new Map(plans.map((p) => [p.id, `Plan de tratamiento de ${patientName(p.patient)}`])),
    CoverageProvider: new Map(providers.map((p) => [p.id, p.name])),
    Branch: new Map(branches.map((b) => [b.id, b.name])),
  }
  return (row: Row): string | null => {
    const direct = row.entityId ? byType[row.entityType]?.get(row.entityId) : undefined
    if (direct) return direct
    const meta = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {}
    if (typeof meta['patientId'] === 'string') return byType['Patient']?.get(meta['patientId']) ?? null
    if (typeof meta['userId'] === 'string') return byType['User']?.get(meta['userId']) ?? null
    return null
  }
}

export async function listAuditLog(db: Db, actor: AuthContext, query: AuditQuery): Promise<AuditListDto> {
  const timeZone = await organizationTimeZone(db, actor.organizationId)
  const where: Prisma.AuditLogWhereInput = {
    organizationId: actor.organizationId,
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: fromLocal(query.from, 0, timeZone) } : {}),
            ...(query.to ? { lt: fromLocal(addDays(query.to, 1), 0, timeZone) } : {}),
          },
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.auditLog.count({ where }),
  ])
  const actorIds = [...new Set(rows.map((row) => row.actorUserId).filter((id): id is string => id !== null))]
  const users = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } })
  const byId = new Map(users.map((user) => [user.id, user]))
  const subjectOf = await describeSubjects(db, actor.organizationId, rows, timeZone)
  return {
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actor: row.actorUserId ? (byId.get(row.actorUserId) ?? null) : null,
      subject: subjectOf(row),
      metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : null,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
}
