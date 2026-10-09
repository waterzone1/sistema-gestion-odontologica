import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { recordAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { hasPermission } from '../users/domain/permissions.js'
import { allocatePayment, balanceCents, fromCents, localDay, toCents, type PendingService } from './domain/balance.js'
import type {
  AccountDto,
  ChargeResultDto,
  CreateChargeInput,
  CreateServiceInput,
  DebtorDto,
  PaymentDto,
  ServiceDto,
} from './billing.schemas.js'

const CLOCK_TOLERANCE_MS = 5 * 60_000
const DEBTORS_LIMIT = 20

const serviceInclude = {
  practice: { select: { id: true, code: true, name: true } },
  professional: { select: { id: true, user: { select: { displayName: true } } } },
  allocations: { select: { amount: true, payment: { select: { voidedAt: true } } } },
} as const

const paymentInclude = {
  createdBy: { select: { displayName: true } },
  allocations: { select: { amount: true, service: { select: { voidedAt: true } } } },
} as const

type ServiceRecord = Prisma.PerformedServiceGetPayload<{ include: typeof serviceInclude }>
type PaymentRecord = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>
type Tx = Prisma.TransactionClient

interface Viewer {
  actor: AuthContext
  showAmounts: boolean
  today: string
  timeZone: string
}

const cents = (value: Prisma.Decimal) => toCents(value.toFixed(2))

async function viewerOf(db: Pick<Db, 'organization'>, actor: AuthContext): Promise<Viewer> {
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: actor.organizationId },
    select: { timezone: true },
  })
  return {
    actor,
    showAmounts: hasPermission(actor.permissions, 'account:read'),
    timeZone: organization.timezone,
    today: localDay(new Date(), organization.timezone),
  }
}

function canVoid(viewer: Viewer, permission: 'services:void' | 'payments:void', createdAt: Date): boolean {
  if (!hasPermission(viewer.actor.permissions, permission)) return false
  if (hasPermission(viewer.actor.permissions, 'billing:void-any-day')) return true
  return localDay(createdAt, viewer.timeZone) === viewer.today
}

function serviceCents(service: ServiceRecord) {
  const price = cents(service.price)
  const paid = service.voidedAt
    ? 0
    : service.allocations.filter((a) => !a.payment.voidedAt).reduce((total, a) => total + cents(a.amount), 0)
  return { price, paid, pending: service.voidedAt ? 0 : price - paid }
}

function paymentCents(payment: PaymentRecord) {
  const amount = cents(payment.amount)
  const allocated = payment.voidedAt
    ? 0
    : payment.allocations.filter((a) => !a.service.voidedAt).reduce((total, a) => total + cents(a.amount), 0)
  return { amount, allocated, unallocated: payment.voidedAt ? 0 : amount - allocated }
}

function toServiceDto(service: ServiceRecord, viewer: Viewer): ServiceDto {
  const { price, paid, pending } = serviceCents(service)
  const show = (value: number) => (viewer.showAmounts ? fromCents(value) : null)
  return {
    id: service.id,
    practice: service.practice,
    professional: { id: service.professional.id, displayName: service.professional.user.displayName },
    appointmentId: service.appointmentId,
    price: show(price),
    catalogPrice: show(cents(service.catalogPrice)),
    paid: show(paid),
    pending: show(pending),
    performedAt: service.performedAt.toISOString(),
    status: service.voidedAt ? 'VOIDED' : 'ACTIVE',
    voidReason: service.voidReason,
    voidable: !service.voidedAt && canVoid(viewer, 'services:void', service.createdAt),
    createdAt: service.createdAt.toISOString(),
  }
}

function toPaymentDto(payment: PaymentRecord, viewer: Viewer): PaymentDto {
  const { amount, allocated, unallocated } = paymentCents(payment)
  return {
    id: payment.id,
    amount: fromCents(amount),
    method: payment.method,
    externalReference: payment.externalReference,
    receivedAt: payment.receivedAt.toISOString(),
    allocated: fromCents(allocated),
    unallocated: fromCents(unallocated),
    createdBy: payment.createdBy.displayName,
    status: payment.voidedAt ? 'VOIDED' : 'ACTIVE',
    voidReason: payment.voidReason,
    voidable: !payment.voidedAt && canVoid(viewer, 'payments:void', payment.createdAt),
    createdAt: payment.createdAt.toISOString(),
  }
}

async function lockPatient(tx: Tx, actor: AuthContext, patientId: string) {
  const rows = await tx.$queryRaw<{ archivedAt: Date | null }[]>`
    SELECT "archivedAt" FROM "Patient"
    WHERE id = ${patientId}::uuid AND "organizationId" = ${actor.organizationId}::uuid
    FOR UPDATE`
  const patient = rows[0]
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'El paciente no existe')
  return patient
}

async function findPatientOrFail(db: Pick<Db, 'patient'>, actor: AuthContext, patientId: string) {
  const patient = await db.patient.findFirst({ where: { id: patientId, organizationId: actor.organizationId } })
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'El paciente no existe')
  return patient
}

function assertNotFuture(iso: string | undefined, label: string): Date {
  const date = iso ? new Date(iso) : new Date()
  if (date.getTime() > Date.now() + CLOCK_TOLERANCE_MS) {
    throw new AppError(422, 'FUTURE_DATE', `${label} no puede ser futura`)
  }
  return date
}

function assertVoidAllowed(viewer: Viewer, permission: 'services:void' | 'payments:void', createdAt: Date): void {
  if (!canVoid(viewer, permission, createdAt)) {
    throw new AppError(
      403,
      'VOID_WINDOW_CLOSED',
      'Solo podés anular lo cargado hoy. Para registros de días anteriores, pedíselo a un administrador',
    )
  }
}

async function resolveProfessional(tx: Tx, actor: AuthContext, requested: string | undefined) {
  const own = await tx.professionalProfile.findFirst({
    where: { userId: actor.userId, active: true, user: { organizationId: actor.organizationId } },
  })
  const choosesAny = hasPermission(actor.permissions, 'services:price')
  if (!choosesAny) {
    if (!own) {
      throw new AppError(422, 'PROFESSIONAL_PROFILE_REQUIRED', 'Tu usuario no tiene un perfil profesional activo')
    }
    if (requested && requested !== own.id) {
      throw new AppError(403, 'FORBIDDEN', 'Solo podés registrar prestaciones a tu nombre')
    }
    return own
  }
  const id = requested ?? own?.id
  if (!id) throw new AppError(422, 'PROFESSIONAL_REQUIRED', 'Elegí el profesional que realizó la prestación')
  const professional = await tx.professionalProfile.findFirst({
    where: { id, active: true, user: { organizationId: actor.organizationId, active: true } },
  })
  if (!professional) throw new AppError(422, 'INVALID_PROFESSIONAL', 'El profesional no existe o está inactivo')
  return professional
}

export async function listServices(db: Db, actor: AuthContext, patientId: string): Promise<ServiceDto[]> {
  await findPatientOrFail(db, actor, patientId)
  const viewer = await viewerOf(db, actor)
  const services = await db.performedService.findMany({
    where: { patientId, organizationId: actor.organizationId },
    include: serviceInclude,
    orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
  })
  return services.map((service) => toServiceDto(service, viewer))
}

export async function createService(
  db: Db,
  actor: AuthContext,
  patientId: string,
  input: CreateServiceInput,
): Promise<ServiceDto> {
  const performedAt = assertNotFuture(input.performedAt, 'La fecha de la prestación')
  if (input.price !== undefined && !hasPermission(actor.permissions, 'services:price')) {
    throw new AppError(403, 'FORBIDDEN', 'No tenés permiso para definir precios')
  }
  const viewer = await viewerOf(db, actor)
  return db.$transaction(async (tx) => {
    const patient = await lockPatient(tx, actor, patientId)
    if (patient.archivedAt) {
      throw new AppError(422, 'PATIENT_ARCHIVED', 'El paciente está archivado: reactivalo para registrar prestaciones')
    }
    const professional = await resolveProfessional(tx, actor, input.professionalId)
    const practice = await tx.practice.findFirst({
      where: { id: input.practiceId, organizationId: actor.organizationId, active: true },
    })
    if (!practice) throw new AppError(422, 'INVALID_PRACTICE', 'La práctica no existe o está inactiva')
    if (input.appointmentId) {
      const appointment = await tx.appointment.findFirst({
        where: {
          id: input.appointmentId,
          patientId,
          professionalId: professional.id,
          organizationId: actor.organizationId,
        },
      })
      if (!appointment) {
        throw new AppError(422, 'INVALID_APPOINTMENT', 'El turno no corresponde a este paciente y profesional')
      }
    }
    const price = input.price ?? practice.basePrice.toFixed(2)
    const service = await tx.performedService.create({
      data: {
        organizationId: actor.organizationId,
        patientId,
        professionalId: professional.id,
        practiceId: practice.id,
        appointmentId: input.appointmentId ?? null,
        price,
        catalogPrice: practice.basePrice,
        performedAt,
        createdById: actor.userId,
      },
      include: serviceInclude,
    })
    await recordAudit(tx, {
      action: 'SERVICE_RECORDED',
      entityType: 'PerformedService',
      entityId: service.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { patientId, practice: practice.code, price: fromCents(toCents(price)) },
    })
    return toServiceDto(service, viewer)
  })
}

export async function adjustServicePrice(
  db: Db,
  actor: AuthContext,
  patientId: string,
  serviceId: string,
  price: string,
): Promise<ServiceDto> {
  const viewer = await viewerOf(db, actor)
  return db.$transaction(async (tx) => {
    await lockPatient(tx, actor, patientId)
    const service = await tx.performedService.findFirst({
      where: { id: serviceId, patientId, organizationId: actor.organizationId },
      include: serviceInclude,
    })
    if (!service) throw new AppError(404, 'NOT_FOUND', 'La prestación no existe')
    if (service.voidedAt) throw new AppError(409, 'ALREADY_VOIDED', 'La prestación está anulada')
    const { price: before, paid } = serviceCents(service)
    const after = toCents(price)
    if (after < paid) {
      throw new AppError(422, 'PRICE_BELOW_PAID', `El precio no puede ser menor a lo ya pagado (${fromCents(paid)})`)
    }
    const updated = await tx.performedService.update({
      where: { id: serviceId },
      data: { price: fromCents(after) },
      include: serviceInclude,
    })
    await recordAudit(tx, {
      action: 'SERVICE_PRICE_CHANGED',
      entityType: 'PerformedService',
      entityId: serviceId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { patientId, before: fromCents(before), after: fromCents(after) },
    })
    return toServiceDto(updated, viewer)
  })
}

export async function voidService(
  db: Db,
  actor: AuthContext,
  patientId: string,
  serviceId: string,
  reason: string,
): Promise<ServiceDto> {
  const viewer = await viewerOf(db, actor)
  return db.$transaction(async (tx) => {
    await lockPatient(tx, actor, patientId)
    const service = await tx.performedService.findFirst({
      where: { id: serviceId, patientId, organizationId: actor.organizationId },
    })
    if (!service) throw new AppError(404, 'NOT_FOUND', 'La prestación no existe')
    if (service.voidedAt) throw new AppError(409, 'ALREADY_VOIDED', 'La prestación ya está anulada')
    assertVoidAllowed(viewer, 'services:void', service.createdAt)
    const voided = await tx.performedService.update({
      where: { id: serviceId },
      data: { voidedAt: new Date(), voidReason: reason, voidedById: actor.userId },
      include: serviceInclude,
    })
    await recordAudit(tx, {
      action: 'SERVICE_VOIDED',
      entityType: 'PerformedService',
      entityId: serviceId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { patientId, price: service.price.toFixed(2), reason },
    })
    return toServiceDto(voided, viewer)
  })
}

async function loadLedger(db: Pick<Db, 'performedService' | 'payment'>, actor: AuthContext, patientId: string) {
  const where = { patientId, organizationId: actor.organizationId }
  const [services, payments] = await Promise.all([
    db.performedService.findMany({
      where,
      include: serviceInclude,
      orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
    }),
    db.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    }),
  ])
  return { services, payments }
}

const availableCredit = (payments: PaymentRecord[]) =>
  payments.reduce((total, payment) => total + paymentCents(payment).unallocated, 0)

export async function getAccount(db: Db, actor: AuthContext, patientId: string): Promise<AccountDto> {
  await findPatientOrFail(db, actor, patientId)
  const viewer = await viewerOf(db, actor)
  const { services, payments } = await loadLedger(db, actor, patientId)
  const activeServices = services.filter((s) => !s.voidedAt).map((s) => cents(s.price))
  const activePayments = payments.filter((p) => !p.voidedAt).map((p) => cents(p.amount))
  return {
    balance: fromCents(balanceCents(activeServices, activePayments)),
    totalServices: fromCents(balanceCents(activeServices, [])),
    totalPayments: fromCents(balanceCents(activePayments, [])),
    availableCredit: fromCents(availableCredit(payments)),
    services: services.map((service) => toServiceDto(service, viewer)),
    payments: payments.map((payment) => toPaymentDto(payment, viewer)),
  }
}

export async function createCharge(
  db: Db,
  actor: AuthContext,
  patientId: string,
  input: CreateChargeInput,
): Promise<ChargeResultDto> {
  const receivedAt = assertNotFuture(input.receivedAt, 'La fecha del pago')
  const viewer = await viewerOf(db, actor)
  return db.$transaction(async (tx) => {
    await lockPatient(tx, actor, patientId)
    const where = { patientId, organizationId: actor.organizationId, voidedAt: null }
    const candidates = await tx.performedService.findMany({
      where,
      include: serviceInclude,
      orderBy: [{ performedAt: 'asc' }, { id: 'asc' }],
    })
    const pending = candidates
      .map((service) => ({ id: service.id, pendingCents: serviceCents(service).pending }))
      .filter((service) => service.pendingCents > 0)
    const selected = input.serviceIds ? new Set(input.serviceIds) : null
    let targets: PendingService[] = selected ? pending.filter((service) => selected.has(service.id)) : pending
    if (selected && targets.length !== selected.size) {
      throw new AppError(
        422,
        'INVALID_SERVICES',
        'Alguna prestación elegida no existe, está anulada o ya está saldada',
      )
    }

    const creditCents = input.credit ? toCents(input.credit) : 0
    if (creditCents > 0) {
      const sources = await tx.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
      })
      if (creditCents > availableCredit(sources)) {
        throw new AppError(422, 'INSUFFICIENT_CREDIT', 'El paciente no tiene ese saldo a favor')
      }
      if (creditCents > targets.reduce((total, t) => total + t.pendingCents, 0)) {
        throw new AppError(422, 'CREDIT_EXCEEDS_PENDING', 'El saldo a favor aplicado supera lo que falta pagar')
      }
      let left = creditCents
      for (const source of sources) {
        if (left === 0) break
        const take = Math.min(left, paymentCents(source).unallocated)
        if (take === 0) continue
        const result = allocatePayment(take, targets)
        await tx.paymentAllocation.createMany({
          data: result.allocations.map((a) => ({ paymentId: source.id, serviceId: a.serviceId, amount: fromCents(a.cents) })),
        })
        targets = result.remaining
        left -= take
      }
      await recordAudit(tx, {
        action: 'CREDIT_APPLIED',
        entityType: 'Patient',
        entityId: patientId,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        metadata: { amount: fromCents(creditCents) },
      })
    }

    const payments: PaymentDto[] = []
    for (const line of input.lines) {
      const result = allocatePayment(toCents(line.amount), targets)
      targets = result.remaining
      const payment = await tx.payment.create({
        data: {
          organizationId: actor.organizationId,
          patientId,
          amount: line.amount,
          method: line.method,
          externalReference: line.externalReference || null,
          receivedAt,
          createdById: actor.userId,
          allocations: {
            create: result.allocations.map((a) => ({ serviceId: a.serviceId, amount: fromCents(a.cents) })),
          },
        },
        include: paymentInclude,
      })
      await recordAudit(tx, {
        action: 'PAYMENT_RECORDED',
        entityType: 'Payment',
        entityId: payment.id,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        metadata: { patientId, amount: payment.amount.toFixed(2), method: line.method },
      })
      payments.push(toPaymentDto(payment, viewer))
    }
    return { payments, creditApplied: fromCents(creditCents) }
  })
}

export async function voidPayment(
  db: Db,
  actor: AuthContext,
  patientId: string,
  paymentId: string,
  reason: string,
): Promise<PaymentDto> {
  const viewer = await viewerOf(db, actor)
  return db.$transaction(async (tx) => {
    await lockPatient(tx, actor, patientId)
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, patientId, organizationId: actor.organizationId },
    })
    if (!payment) throw new AppError(404, 'NOT_FOUND', 'El pago no existe')
    if (payment.voidedAt) throw new AppError(409, 'ALREADY_VOIDED', 'El pago ya está anulado')
    assertVoidAllowed(viewer, 'payments:void', payment.createdAt)
    const voided = await tx.payment.update({
      where: { id: paymentId },
      data: { voidedAt: new Date(), voidReason: reason, voidedById: actor.userId },
      include: paymentInclude,
    })
    await recordAudit(tx, {
      action: 'PAYMENT_VOIDED',
      entityType: 'Payment',
      entityId: paymentId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { patientId, amount: payment.amount.toFixed(2), reason },
    })
    return toPaymentDto(voided, viewer)
  })
}

export async function listDebtors(db: Db, actor: AuthContext): Promise<DebtorDto[]> {
  const where = { organizationId: actor.organizationId, voidedAt: null }
  const [services, payments] = await Promise.all([
    db.performedService.groupBy({ by: ['patientId'], where, _sum: { price: true } }),
    db.payment.groupBy({ by: ['patientId'], where, _sum: { amount: true } }),
  ])
  const paid = new Map(payments.map((p) => [p.patientId, p._sum.amount ? cents(p._sum.amount) : 0]))
  const debts = services
    .map((s) => ({
      patientId: s.patientId,
      balance: (s._sum.price ? cents(s._sum.price) : 0) - (paid.get(s.patientId) ?? 0),
    }))
    .filter((debt) => debt.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, DEBTORS_LIMIT)
  const patients = await db.patient.findMany({
    where: { id: { in: debts.map((d) => d.patientId) } },
    select: { id: true, firstName: true, lastName: true },
  })
  const names = new Map(patients.map((p) => [p.id, `${p.lastName}, ${p.firstName}`]))
  return debts.map((debt) => ({
    patientId: debt.patientId,
    fullName: names.get(debt.patientId) ?? '',
    balance: fromCents(debt.balance),
  }))
}
