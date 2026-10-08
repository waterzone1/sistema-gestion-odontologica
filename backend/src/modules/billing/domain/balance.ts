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
}

export function allocatePayment(paymentCents: number, services: readonly PendingService[]): AllocationResult {
  const allocations: Allocation[] = []
  let remaining = paymentCents
  for (const service of services) {
    if (remaining <= 0) break
    const cents = Math.min(remaining, service.pendingCents)
    if (cents <= 0) continue
    allocations.push({ serviceId: service.id, cents })
    remaining -= cents
  }
  return { allocations, unallocatedCents: remaining }
}

export function balanceCents(serviceCents: readonly number[], paymentCents: readonly number[]): number {
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
  return sum(serviceCents) - sum(paymentCents)
}
