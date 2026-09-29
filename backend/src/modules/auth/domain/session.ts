export const SESSION_IDLE_MS = 8 * 60 * 60 * 1000
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000
const TOUCH_INTERVAL_MS = 60 * 1000

export type SessionState = 'valid' | 'revoked' | 'expired' | 'idle'

interface SessionTimes {
  lastSeenAt: Date
  expiresAt: Date
  revokedAt: Date | null
}

export function sessionState(session: SessionTimes, now: Date): SessionState {
  if (session.revokedAt) return 'revoked'
  if (now >= session.expiresAt) return 'expired'
  if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_IDLE_MS) return 'idle'
  return 'valid'
}

export function absoluteExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_ABSOLUTE_MS)
}

// no hace falta escribir en la base en cada request, alcanza con refrescar de a ratos
export function shouldTouch(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= TOUCH_INTERVAL_MS
}
