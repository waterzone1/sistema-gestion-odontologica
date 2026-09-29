import { z } from 'zod'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { recordAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'

export const professionalParamsSchema = z.object({ userId: z.uuid() })

export const saveProfessionalSchema = z
  .object({
    licenseNumber: z.string().trim().min(1, 'Ingresá la matrícula').max(40),
    specialty: z
      .string()
      .trim()
      .max(120)
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional(),
    active: z.boolean().optional(),
  })
  .meta({ id: 'SaveProfessionalInput' })

export const professionalSchema = z
  .object({
    userId: z.uuid(),
    displayName: z.string(),
    licenseNumber: z.string(),
    specialty: z.string().nullable(),
    active: z.boolean(),
    branchIds: z.array(z.uuid()),
  })
  .meta({ id: 'Professional' })

export type SaveProfessionalInput = z.infer<typeof saveProfessionalSchema>
export type ProfessionalDto = z.infer<typeof professionalSchema>

const include = { user: { include: { branches: true } } } as const

type ProfileRecord = NonNullable<
  Awaited<ReturnType<Db['professionalProfile']['findFirst']>>
> & { user: { displayName: string; branches: { branchId: string }[] } }

function toDto(profile: ProfileRecord): ProfessionalDto {
  return {
    userId: profile.userId,
    displayName: profile.user.displayName,
    licenseNumber: profile.licenseNumber,
    specialty: profile.specialty,
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

// el perfil profesional es de un usuario con rol odontologo
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

    const profile = await tx.professionalProfile.upsert({
      where: { userId },
      create: {
        userId,
        licenseNumber: input.licenseNumber,
        specialty: input.specialty ?? null,
        active: input.active ?? true,
      },
      update: {
        licenseNumber: input.licenseNumber,
        ...(input.specialty !== undefined ? { specialty: input.specialty } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include,
    })
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
