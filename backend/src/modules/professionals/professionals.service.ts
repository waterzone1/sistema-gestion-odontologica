import { z } from 'zod'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { emailSchema, phoneSchema } from '../../shared/schemas.js'
import { recordAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'

export const professionalParamsSchema = z.object({ userId: z.uuid() })

export const saveProfessionalSchema = z
  .object({
    licenseNumber: z.string().trim().min(1, 'Ingresá la matrícula').max(40),
    phone: phoneSchema,
    email: emailSchema,
    practiceIds: z
      .array(z.uuid())
      .max(200)
      .optional()
      .meta({ description: 'Prácticas que realiza. Vacío: puede recibir turnos de cualquier práctica' }),
    active: z.boolean().optional(),
  })
  .meta({ id: 'SaveProfessionalInput' })

export const professionalSchema = z
  .object({
    id: z.uuid(),
    userId: z.uuid(),
    displayName: z.string(),
    licenseNumber: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    practiceIds: z.array(z.uuid()),
    active: z.boolean(),
    branchIds: z.array(z.uuid()),
  })
  .meta({ id: 'Professional' })

export type SaveProfessionalInput = z.infer<typeof saveProfessionalSchema>
export type ProfessionalDto = z.infer<typeof professionalSchema>

const include = { user: { include: { branches: true } }, practices: { select: { practiceId: true } } } as const

type ProfileRecord = NonNullable<
  Awaited<ReturnType<Db['professionalProfile']['findFirst']>>
> & { user: { displayName: string; branches: { branchId: string }[] }; practices: { practiceId: string }[] }

function toDto(profile: ProfileRecord): ProfessionalDto {
  return {
    id: profile.id,
    userId: profile.userId,
    displayName: profile.user.displayName,
    licenseNumber: profile.licenseNumber,
    phone: profile.phone,
    email: profile.email,
    practiceIds: profile.practices.map((p) => p.practiceId),
    active: profile.active,
    branchIds: profile.user.branches.map((b) => b.branchId),
  }
}

export async function listProfessionals(db: Db, actor: AuthContext): Promise<ProfessionalDto[]> {
  const profiles = await db.professionalProfile.findMany({
    where: { user: { organizationId: actor.organizationId } },
    include,
    orderBy: { user: { displayName: 'asc' } },
  })
  return profiles.map(toDto)
}

export async function saveProfessional(
  db: Db,
  actor: AuthContext,
  userId: string,
  input: SaveProfessionalInput,
): Promise<ProfessionalDto> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId, organizationId: actor.organizationId },
      include: { roles: true },
    })
    if (!user) throw new AppError(404, 'NOT_FOUND', 'El usuario no existe')
    if (!user.roles.some((r) => r.role === 'DENTIST')) {
      throw new AppError(422, 'NOT_A_DENTIST', 'Solo un usuario con rol Odontólogo puede tener perfil profesional')
    }

    if (input.practiceIds?.length) {
      const known = await tx.practice.count({
        where: { id: { in: input.practiceIds }, organizationId: actor.organizationId },
      })
      if (known !== new Set(input.practiceIds).size) {
        throw new AppError(422, 'INVALID_PRACTICE', 'Alguna práctica elegida no existe')
      }
    }
    const saved = await tx.professionalProfile.upsert({
      where: { userId },
      create: {
        userId,
        licenseNumber: input.licenseNumber,
        phone: input.phone ?? null,
        email: input.email ?? null,
        active: input.active ?? true,
      },
      update: {
        licenseNumber: input.licenseNumber,
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    })
    if (input.practiceIds) {
      await tx.professionalPractice.deleteMany({ where: { professionalId: saved.id } })
      await tx.professionalPractice.createMany({
        data: [...new Set(input.practiceIds)].map((practiceId) => ({ professionalId: saved.id, practiceId })),
      })
    }
    const profile = await tx.professionalProfile.findUniqueOrThrow({ where: { id: saved.id }, include })
    await recordAudit(tx, {
      action: 'PROFESSIONAL_SAVED',
      entityType: 'ProfessionalProfile',
      entityId: profile.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      metadata: { userId },
    })
    return toDto(profile)
  })
}
