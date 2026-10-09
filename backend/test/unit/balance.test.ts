import { describe, expect, it } from 'vitest'
import { allocatePayment, balanceCents, fromCents, localDay, toCents } from '../../src/modules/billing/domain/balance.js'

describe('importes en centavos', () => {
  it('convierte sin errores de punto flotante', () => {
    expect(toCents('25000.00')).toBe(2500000)
    expect(toCents('0.10')).toBe(10)
    expect(toCents('0.3')).toBe(30)
    expect(toCents('19.99')).toBe(1999)
    expect(toCents('12')).toBe(1200)
    expect(toCents('-5.05')).toBe(-505)
  })

  it('rechaza formatos invalidos', () => {
    expect(() => toCents('1,50')).toThrow()
    expect(() => toCents('1.234')).toThrow()
    expect(() => toCents('')).toThrow()
  })

  it('formatea con dos decimales', () => {
    expect(fromCents(2500000)).toBe('25000.00')
    expect(fromCents(5)).toBe('0.05')
    expect(fromCents(-505)).toBe('-5.05')
    expect(fromCents(0)).toBe('0.00')
  })

  it('ida y vuelta', () => {
    for (const value of ['0.01', '1.10', '999999999999.99']) expect(fromCents(toCents(value))).toBe(value)
  })
})

describe('allocatePayment', () => {
  const servicios = [
    { id: 'a', pendingCents: 10000 },
    { id: 'b', pendingCents: 5000 },
    { id: 'c', pendingCents: 7000 },
  ]

  it('un pago parcial cubre la prestacion mas antigua primero', () => {
    expect(allocatePayment(4000, servicios)).toMatchObject({
      allocations: [{ serviceId: 'a', cents: 4000 }],
      unallocatedCents: 0,
    })
  })

  it('un pago que excede una prestacion sigue con la siguiente', () => {
    expect(allocatePayment(12000, servicios)).toMatchObject({
      allocations: [
        { serviceId: 'a', cents: 10000 },
        { serviceId: 'b', cents: 2000 },
      ],
      unallocatedCents: 0,
    })
  })

  it('lo que sobra queda como saldo a favor', () => {
    expect(allocatePayment(30000, servicios)).toMatchObject({
      allocations: [
        { serviceId: 'a', cents: 10000 },
        { serviceId: 'b', cents: 5000 },
        { serviceId: 'c', cents: 7000 },
      ],
      unallocatedCents: 8000,
    })
  })

  it('sin prestaciones pendientes todo queda a favor', () => {
    expect(allocatePayment(1500, [])).toEqual({ allocations: [], unallocatedCents: 1500, remaining: [] })
  })

  it('ignora prestaciones sin pendiente', () => {
    expect(allocatePayment(1000, [{ id: 'x', pendingCents: 0 }, ...servicios]).allocations).toEqual([
      { serviceId: 'a', cents: 1000 },
    ])
  })

  it('conserva el total: asignado mas sobrante es igual al pago', () => {
    for (const pago of [1, 4999, 10000, 22000, 99999]) {
      const { allocations, unallocatedCents } = allocatePayment(pago, servicios)
      const asignado = allocations.reduce((total, a) => total + a.cents, 0)
      expect(asignado + unallocatedCents).toBe(pago)
    }
  })
})

describe('allocatePayment encadenado', () => {
  it('devuelve lo que queda pendiente para aplicar el medio de pago siguiente', () => {
    const servicios = [
      { id: 'a', pendingCents: 10000 },
      { id: 'b', pendingCents: 5000 },
    ]
    const credito = allocatePayment(3000, servicios)
    expect(credito.remaining).toEqual([
      { id: 'a', pendingCents: 7000 },
      { id: 'b', pendingCents: 5000 },
    ])
    const efectivo = allocatePayment(8000, credito.remaining)
    expect(efectivo.allocations).toEqual([
      { serviceId: 'a', cents: 7000 },
      { serviceId: 'b', cents: 1000 },
    ])
    expect(efectivo.remaining).toEqual([{ id: 'b', pendingCents: 4000 }])
  })
})

describe('localDay', () => {
  it('usa el dia de la zona horaria del consultorio', () => {
    const casiMedianoche = new Date('2026-10-09T02:30:00Z')
    expect(localDay(casiMedianoche, 'America/Argentina/Buenos_Aires')).toBe('2026-10-08')
    expect(localDay(casiMedianoche, 'UTC')).toBe('2026-10-09')
  })
})

describe('balanceCents', () => {
  it('es prestaciones menos pagos', () => {
    expect(balanceCents([10000, 5000], [4000])).toBe(11000)
  })

  it('queda negativo cuando hay saldo a favor', () => {
    expect(balanceCents([10000], [15000])).toBe(-5000)
  })

  it('sin movimientos es cero', () => {
    expect(balanceCents([], [])).toBe(0)
  })
})
