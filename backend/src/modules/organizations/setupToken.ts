import { generateToken, safeEqual } from '../../shared/tokens.js'

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
