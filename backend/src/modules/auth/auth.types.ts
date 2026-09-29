import type { Permission, Role } from '../users/domain/permissions.js'

export interface AuthContext {
  userId: string
  organizationId: string
  sessionId: string
  csrfToken: string
  username: string
  displayName: string
  roles: Role[]
  permissions: Permission[]
  branchIds: string[]
  mustChangePassword: boolean
  onboardingCompleted: boolean
}
