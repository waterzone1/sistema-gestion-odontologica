import { describe, expect, it } from 'vitest'
import { isOpenItem, itemLocation, ITEM_STATUS_LABELS, TOOTH_OPTIONS } from '@/lib/treatment'

describe('plan de tratamiento', () => {
  it('ofrece las 52 piezas FDI ordenadas', () => {
    expect(TOOTH_OPTIONS).toHaveLength(52)
    expect(TOOTH_OPTIONS[0]).toBe(11)
    expect(TOOTH_OPTIONS.at(-1)).toBe(85)
  })

  it('describe la pieza y las superficies, o nada si no hay pieza', () => {
    expect(itemLocation({ tooth: 46, surfaces: ['O', 'M'] })).toBe('Pieza 46 (O, M)')
    expect(itemLocation({ tooth: 11, surfaces: [] })).toBe('Pieza 11')
    expect(itemLocation({ tooth: null, surfaces: [] })).toBeNull()
  })

  it('solo los pendientes y en curso siguen abiertos', () => {
    expect(isOpenItem({ status: 'PLANNED' })).toBe(true)
    expect(isOpenItem({ status: 'IN_PROGRESS' })).toBe(true)
    expect(isOpenItem({ status: 'COMPLETED' })).toBe(false)
    expect(ITEM_STATUS_LABELS.COMPLETED).toBe('Realizado')
  })
})
