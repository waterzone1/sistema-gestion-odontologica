export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}

export function isExclusionViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const { code, meta } = err as Error & { code?: unknown; meta?: unknown }
  const text = `${err.message} ${String(code)} ${JSON.stringify(meta)}`
  return text.includes('23P01') || text.includes('Appointment_no_overlap')
}
