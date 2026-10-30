import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { recordActorAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { hasPermission, type Permission } from '../users/domain/permissions.js'
import { readSettings, type OrganizationSettings } from './domain/settings.js'
import type { OrganizationDto, OrganizationModules, UpdateOrganizationInput, UpdateSettingsInput } from './organization.schemas.js'

const SECTION_PERMISSION: Record<keyof OrganizationSettings, Permission> = {
  backups: 'backups:manage',
  reminders: 'appointments:manage',
  files: 'organization:manage',
  sessions: 'organization:manage',
}

export async function organizationSettings(db: Pick<Db, 'organization'>, organizationId: string): Promise<OrganizationSettings> {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } })
  return readSettings(organization.settings)
}

export async function getOrganization(db: Db, actor: AuthContext, fileMaxMb: number): Promise<OrganizationDto> {
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: actor.organizationId },
    select: { name: true, timezone: true, coveragesEnabled: true, settings: true },
  })
  return {
    name: organization.name,
    timezone: organization.timezone,
    modules: { coverages: organization.coveragesEnabled },
    settings: readSettings(organization.settings),
    limits: { fileMaxMb },
  }
}

export async function updateOrganization(db: Db, actor: AuthContext, input: UpdateOrganizationInput, fileMaxMb: number): Promise<OrganizationDto> {
  await db.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: actor.organizationId }, data: input })
    await recordActorAudit(tx, actor, {
      action: 'ORGANIZATION_UPDATED',
      entityType: 'Organization',
      entityId: actor.organizationId,
      metadata: { campos: Object.keys(input) },
    })
  })
  return getOrganization(db, actor, fileMaxMb)
}

export async function saveSettings(db: Db, actor: AuthContext, input: UpdateSettingsInput, fileMaxMb: number): Promise<OrganizationDto> {
  const keys = Object.keys(input) as (keyof OrganizationSettings)[]
  const denied = keys.filter((key) => !hasPermission(actor.permissions, SECTION_PERMISSION[key]))
  if (denied.length > 0) throw new AppError(403, 'FORBIDDEN', 'No tenés permiso para cambiar esa configuración')
  if (input.files && input.files.maxMb > fileMaxMb) {
    throw new AppError(422, 'FILE_LIMIT_TOO_HIGH', `El servidor admite hasta ${fileMaxMb} MB por archivo`)
  }
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "Organization" SET "settings" = "settings" || ${JSON.stringify(input)}::jsonb WHERE "id" = ${actor.organizationId}::uuid`
    await recordActorAudit(tx, actor, {
      action: 'ORGANIZATION_SETTINGS_UPDATED',
      entityType: 'Organization',
      entityId: actor.organizationId,
      metadata: { secciones: keys } satisfies Prisma.InputJsonValue,
    })
  })
  return getOrganization(db, actor, fileMaxMb)
}

export async function setModules(db: Db, actor: AuthContext, modules: OrganizationModules): Promise<OrganizationModules> {
  return db.$transaction(async (tx) => {
    const updated = await tx.organization.update({
      where: { id: actor.organizationId },
      data: { coveragesEnabled: modules.coverages },
      select: { coveragesEnabled: true },
    })
    await recordActorAudit(tx, actor, {
      action: 'ORGANIZATION_MODULES_UPDATED',
      entityType: 'Organization',
      entityId: actor.organizationId,
      metadata: { coberturas: modules.coverages },
    })
    return { coverages: updated.coveragesEnabled }
  })
}
