import type { CookieOptions, Response } from 'express'

export const SESSION_COOKIE = 'sid'

function baseOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/' }
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, { ...baseOptions(secure), expires: expiresAt })
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, baseOptions(secure))
}
