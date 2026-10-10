export const SURFACES = ['M', 'D', 'V', 'L', 'O'] as const
export type Surface = (typeof SURFACES)[number]

export const CONDITIONS = [
  'HEALTHY',
  'CARIES',
  'RESTORATION',
  'TEMP_RESTORATION',
  'CROWN',
  'ROOT_CANAL',
  'IMPLANT',
  'FRACTURE',
  'MISSING',
  'EXTRACTION_INDICATED',
  'SEALANT',
  'PROSTHESIS',
] as const
export type Condition = (typeof CONDITIONS)[number]

const WHOLE_TOOTH: readonly Condition[] = [
  'CROWN',
  'ROOT_CANAL',
  'IMPLANT',
  'MISSING',
  'EXTRACTION_INDICATED',
  'PROSTHESIS',
]

export function isValidTooth(tooth: number): boolean {
  const quadrant = Math.floor(tooth / 10)
  const position = tooth % 10
  if (quadrant >= 1 && quadrant <= 4) return position >= 1 && position <= 8
  if (quadrant >= 5 && quadrant <= 8) return position >= 1 && position <= 5
  return false
}

function isWholeTooth(condition: Condition): boolean {
  return WHOLE_TOOTH.includes(condition)
}

export function findingProblem(tooth: number, condition: Condition, surfaces: readonly Surface[]): string | null {
  if (!isValidTooth(tooth)) return 'La pieza no existe en la numeración FDI'
  if (new Set(surfaces).size !== surfaces.length) return 'Hay superficies repetidas'
  if (isWholeTooth(condition) && surfaces.length > 0) return 'Esa condición corresponde a la pieza completa, sin superficies'
  return null
}

export interface Finding {
  tooth: number
  surface: Surface | null
  condition: Condition
  createdAt: Date
}

export function currentState<T extends Finding>(findings: readonly T[]): T[] {
  const sorted = [...findings].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const latest = new Map<string, T>()
  for (const finding of sorted) {
    if (finding.surface === null) {
      for (const key of [...latest.keys()]) if (key.startsWith(`${finding.tooth}:`)) latest.delete(key)
    }
    latest.set(`${finding.tooth}:${finding.surface ?? '*'}`, finding)
  }
  return [...latest.values()]
    .filter((finding) => finding.condition !== 'HEALTHY')
    .sort((a, b) => a.tooth - b.tooth || (a.surface ?? '').localeCompare(b.surface ?? ''))
}
