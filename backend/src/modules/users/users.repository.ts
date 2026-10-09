import type { Db } from '../../shared/db.js'
import type { UserDto } from './users.schemas.js'

const userInclude = { roles: true, branches: true, professionalProfile: true } as const

type Client = Pick<Db, 'user'>

export function findUsers(db: Client, organizationId: string) {
  return db.user.findMany({
    where: { organizationId },
    include: userInclude,
    orderBy: [{ active: 'desc' }, { displayName: 'asc' }],
  })
}

export function findUserById(db: Client, organizationId: string, id: string) {
  return db.user.findFirst({ where: { id, organizationId }, include: userInclude })
}

export function findActiveAdminIds(db: Client, organizationId: string): Promise<string[]> {
  return db.user
    .findMany({
      where: { organizationId, active: true, roles: { some: { role: 'ADMIN' } } },
      select: { id: true },
    })
    .then((rows) => rows.map((r) => r.id))
}

type UserRecord = NonNullable<Awaited<ReturnType<typeof findUserById>>>

export function toUserDto(user: UserRecord): UserDto {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    roles: user.roles.map((r) => r.role),
    branchIds: user.branches.map((b) => b.branchId),
    professional: user.professionalProfile
      ? {
          licenseNumber: user.professionalProfile.licenseNumber,
          active: user.professionalProfile.active,
        }
      : null,
    createdAt: user.createdAt.toISOString(),
  }
}
