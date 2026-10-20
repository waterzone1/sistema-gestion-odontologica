import { describe, expect, it } from 'vitest'
import { backupsToDelete, type RetainedBackup } from '../../src/modules/backups/domain/retention.js'

const dia = (iso: string) => iso.slice(0, 10)

function diarios(desde: string, cantidad: number): RetainedBackup[] {
  const inicio = new Date(`${desde}T03:00:00.000Z`)
  return Array.from({ length: cantidad }, (_, i) => {
    const fecha = new Date(inicio.getTime() + i * 86_400_000)
    return { id: `d-${dia(fecha.toISOString())}`, kind: 'SCHEDULED' as const, status: 'SUCCEEDED' as const, startedAt: fecha.toISOString() }
  })
}

describe('retencion de backups', () => {
  it('conserva los ultimos 7 diarios y uno por semana de las ultimas 4 semanas', () => {
    const backups = diarios('2026-09-01', 50)
    const borrar = new Set(backupsToDelete(backups, dia))
    const quedan = backups.filter((b) => !borrar.has(b.id)).map((b) => b.id)
    expect(quedan).toHaveLength(9)
    expect(quedan).toContain('d-2026-10-20')
    expect(quedan).toContain('d-2026-10-14')
    expect(quedan).not.toContain('d-2026-10-13')
    expect(quedan).toEqual(expect.arrayContaining(['d-2026-10-11', 'd-2026-10-04']))
    expect(quedan).not.toContain('d-2026-09-27')
  })

  it('con dos backups el mismo dia conserva el mas reciente como diario', () => {
    const backups: RetainedBackup[] = [
      { id: 'temprano', kind: 'SCHEDULED', status: 'SUCCEEDED', startedAt: '2026-10-20T03:00:00.000Z' },
      { id: 'tarde', kind: 'SCHEDULED', status: 'SUCCEEDED', startedAt: '2026-10-20T15:00:00.000Z' },
    ]
    expect(backupsToDelete(backups, dia)).toEqual(['temprano'])
  })

  it('los manuales se conservan aparte, nunca borra uno en curso y guarda pocos fallidos', () => {
    const manuales: RetainedBackup[] = Array.from({ length: 12 }, (_, i) => ({
      id: `m-${i}`,
      kind: 'MANUAL',
      status: 'SUCCEEDED',
      startedAt: `2026-10-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`,
    }))
    const enCurso: RetainedBackup = { id: 'corriendo', kind: 'MANUAL', status: 'RUNNING', startedAt: '2026-09-01T00:00:00.000Z' }
    const borrar = backupsToDelete([...manuales, enCurso], dia)
    expect(borrar.sort()).toEqual(['m-0', 'm-1'])
  })
})
