export function toCents(amount: string): number {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount)
  if (!match) throw new Error(`importe invalido: ${amount}`)
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'))
  return match[1] ? -cents : cents
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}

export interface PendingService {
  id: string
  pendingCents: number
}

interface Allocation {
  serviceId: string
  cents: number
}

export interface AllocationResult {
  allocations: Allocation[]
  unallocatedCents: number
  remaining: PendingService[]
}

export function allocatePayment(paymentCents: number, services: readonly PendingService[]): AllocationResult {
  const allocations: Allocation[] = []
  const remaining: PendingService[] = []
  let left = paymentCents
  for (const service of services) {
    const cents = Math.max(0, Math.min(left, service.pendingCents))
    if (cents > 0) {
      allocations.push({ serviceId: service.id, cents })
      left -= cents
    }
    if (service.pendingCents - cents > 0) remaining.push({ id: service.id, pendingCents: service.pendingCents - cents })
  }
  return { allocations, unallocatedCents: left, remaining }
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

export function localDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
