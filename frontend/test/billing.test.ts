import { describe, expect, it } from 'vitest'
import { adjustByPercent, isValidAmount, normalizeAmount, PAYMENT_METHOD_LABELS } from '@/lib/billing'

describe('importes de pago', () => {
  it('acepta coma o punto decimal', () => {
    expect(normalizeAmount(' 1500,50 ')).toBe('1500.50')
    expect(normalizeAmount('1500.5')).toBe('1500.5')
  })

  it('valida importes positivos con hasta dos decimales', () => {
    for (const valido of ['1', '4000', '0,5', '12.50', '999999999999.99']) expect(isValidAmount(valido)).toBe(true)
    for (const invalido of ['', '0', '0,00', '-5', '1,234', 'abc', '1.000,50']) expect(isValidAmount(invalido)).toBe(false)
  })
})

describe('medios de pago', () => {
  it('tienen etiqueta en español, incluido el saldo a favor', () => {
    expect(Object.values(PAYMENT_METHOD_LABELS)).toEqual(['Efectivo', 'Transferencia', 'Tarjeta', 'Mercado Pago', 'Otro', 'Saldo a favor'])
  })
})

describe('ajustes de precio por porcentaje', () => {
  it('aplica el porcentaje sobre el precio de catálogo y redondea al centavo', () => {
    expect(adjustByPercent('10000.00', 25)).toBe('12500.00')
    expect(adjustByPercent('10000.00', -10)).toBe('9000.00')
    expect(adjustByPercent('999.99', -25)).toBe('749.99')
    expect(adjustByPercent('25000.50', 0)).toBe('25000.50')
  })
})
