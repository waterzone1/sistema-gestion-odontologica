import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { isUniqueViolation } from '../../shared/prismaErrors.js'
import { recordAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import type { CreatePracticeInput, PracticeDto, UpdatePracticeInput } from './practices.schemas.js'

type PracticeRecord = NonNullable<Awaited<ReturnType<Db['practice']['findFirst']>>>

function toDto(practice: PracticeRecord): PracticeDto {
  return {
    id: practice.id,
    code: practice.code,
    name: practice.name,
    defaultDurationMinutes: practice.defaultDurationMinutes,
    basePrice: practice.basePrice.toFixed(2),
    active: practice.active,
  }
}

const duplicatedCode = () =>
  new AppError(409, 'DUPLICATE_PRACTICE', 'Ya existe una práctica con ese código')

export async function listPractices(
  db: Db,
  actor: AuthContext,
  status: 'active' | 'all',
): Promise<PracticeDto[]> {
  const practices = await db.practice.findMany({
    where: { organizationId: actor.organizationId, ...(status === 'active' ? { active: true } : {}) },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  })
  return practices.map(toDto)
}

export async function createPractice(
  db: Db,
  actor: AuthContext,
  input: CreatePracticeInput,
): Promise<PracticeDto> {
  try {
    return await db.$transaction(async (tx) => {
      const practice = await tx.practice.create({
        data: { organizationId: actor.organizationId, ...input },
      })
      await recordAudit(tx, {
        action: 'PRACTICE_CREATED',
        entityType: 'Practice',
        entityId: practice.id,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        metadata: { codigo: practice.code, precio: practice.basePrice.toFixed(2) },
      })
      return toDto(practice)
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicatedCode()
    throw err
  }
}

export async function updatePractice(
  db: Db,
  actor: AuthContext,
  id: string,
  input: UpdatePracticeInput,
): Promise<PracticeDto> {
  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.practice.findFirst({
        where: { id, organizationId: actor.organizationId },
      })
      if (!current) throw new AppError(404, 'NOT_FOUND', 'La práctica no existe')
      const updated = await tx.practice.update({ where: { id }, data: input })
      const priceChanged = !updated.basePrice.equals(current.basePrice)
      await recordAudit(tx, {
        action: 'PRACTICE_UPDATED',
        entityType: 'Practice',
        entityId: id,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        metadata: {
          campos: Object.keys(input),
          ...(priceChanged
            ? {
                precioAntes: current.basePrice.toFixed(2),
                precioDespues: updated.basePrice.toFixed(2),
              }
            : {}),
        },
      })
      return toDto(updated)
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicatedCode()
    throw err
  }
}
