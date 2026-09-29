import { hash, verify } from '@node-rs/argon2'

// los defaults de la libreria son argon2id con 19 MiB, t=2, p=1 (minimo recomendado por owasp)
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

let dummyHash: Promise<string> | undefined

// se usa cuando el usuario no existe, para que el tiempo de respuesta no delate si existe o no
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('clave-inexistente-para-igualar-tiempos')
  await verifyPassword(await dummyHash, password)
}
