import { hash, verify } from '@node-rs/argon2'

export function hashPassword(password: string): Promise<string> {
  return hash(password)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

let decoyHash: Promise<string> | undefined

export async function verifyAgainstDecoy(password: string): Promise<void> {
  decoyHash ??= hashPassword('clave-inexistente-para-igualar-tiempos')
  await verifyPassword(await decoyHash, password)
}
