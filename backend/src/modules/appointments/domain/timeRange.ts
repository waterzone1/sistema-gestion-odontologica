const MIN_MINUTES = 5
const MAX_MINUTES = 8 * 60

export function rangeProblem(startsAt: Date, endsAt: Date): string | null {
  const minutes = (endsAt.getTime() - startsAt.getTime()) / 60_000
  if (Number.isNaN(minutes) || minutes <= 0) return 'El turno tiene que terminar después de empezar'
  if (minutes < MIN_MINUTES) return `El turno tiene que durar al menos ${MIN_MINUTES} minutos`
  if (minutes > MAX_MINUTES) return 'El turno no puede durar más de 8 horas'
  return null
}
