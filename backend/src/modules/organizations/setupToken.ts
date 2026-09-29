import { generateToken, safeEqual } from '../../shared/tokens.js'

// el token de setup vive solo en memoria: se muestra en el log del servidor al arrancar sin configurar
export interface SetupTokenStore {
  issue(): string
  matches(candidate: string): boolean
  consume(): void
}

export function createSetupTokenStore(initial: string | null = null): SetupTokenStore {
  let current = initial
  return {
    issue() {
      current = generateToken()
      return current
    },
    matches(candidate) {
      return current !== null && safeEqual(current, candidate)
    },
    consume() {
      current = null
    },
  }
}
