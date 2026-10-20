import { describe, expect, it } from 'vitest'
import { coverageInput, coverageReady } from '@/components/billing/coverage-notice'
import type { CoverageQuote } from '@/lib/api'
import { auditActionLabel, metadataText } from '@/lib/audit'
import { visibleNav } from '@/lib/nav'

const cotizacion = (requiresAuthorization: boolean): CoverageQuote => ({
  coverage: {
    id: 'c',
    provider: { id: 'p', name: 'OSDE', kind: 'PREPAGA' },
    plan: { id: 'pl', name: '210' },
    affiliateNumber: '123',
  },
  insurerAmount: '7000.00',
  patientCopay: '3000.00',
  requiresAuthorization,
})

describe('cobertura al registrar una prestacion', () => {
  it('sin cobertura no manda nada extra', () => {
    const sinCobertura: CoverageQuote = { coverage: null, insurerAmount: null, patientCopay: null, requiresAuthorization: false }
    expect(coverageInput(sinCobertura, { apply: true, authorizationCode: '' })).toEqual({})
    expect(coverageReady(sinCobertura, { apply: true, authorizationCode: '' })).toBe(true)
  })

  it('exige la autorizacion solo si el convenio la pide y se aplica la cobertura', () => {
    expect(coverageReady(cotizacion(true), { apply: true, authorizationCode: ' ' })).toBe(false)
    expect(coverageReady(cotizacion(true), { apply: false, authorizationCode: '' })).toBe(true)
    expect(coverageInput(cotizacion(true), { apply: true, authorizationCode: ' AUT-1 ' })).toEqual({
      applyCoverage: true,
      authorizationCode: 'AUT-1',
    })
    expect(coverageInput(cotizacion(false), { apply: false, authorizationCode: 'X' })).toEqual({ applyCoverage: false })
  })
})

describe('auditoria', () => {
  it('traduce las acciones y deja a la vista las desconocidas', () => {
    expect(auditActionLabel('BACKUP_RESTORED')).toBe('Restauración desde backup')
    expect(auditActionLabel('ALGO_NUEVO')).toBe('ALGO_NUEVO')
  })

  it('muestra los metadatos como texto', () => {
    expect(metadataText({ campos: ['phone', 'email'], reprogramado: false })).toBe('campos: phone, email · reprogramado: false')
    expect(metadataText(null)).toBe('')
  })
})

describe('menu del MVP 4', () => {
  const enlaces = (permissions: Parameters<typeof visibleNav>[0]['permissions']) =>
    visibleNav({ permissions }).flatMap((group) => group.items.map((item) => item.href))

  it('auditoria y backups solo para administracion; coberturas y liquidaciones tambien para recepcion', () => {
    expect(enlaces(['coverages:manage', 'liquidations:manage'])).toEqual(['/dashboard', '/liquidations', '/coverages', '/settings'])
    expect(enlaces(['audit:read', 'backups:manage'])).toEqual(['/dashboard', '/admin/audit', '/admin/backups', '/settings'])
  })
})
