import type { Odontogram } from './api'

export type Surface = 'M' | 'D' | 'V' | 'L' | 'O'
export type Condition = Odontogram['current'][number]['condition']
export type Region = 'top' | 'bottom' | 'left' | 'right' | 'center'

export const PERMANENT_ROWS: number[][] = [
  [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
]

export const TEMPORARY_ROWS: number[][] = [
  [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
]

export const SURFACE_LABELS: Record<Surface, string> = {
  M: 'Mesial',
  D: 'Distal',
  V: 'Vestibular',
  L: 'Lingual / palatina',
  O: 'Oclusal / incisal',
}

export const CONDITION_LABELS: Record<Condition, string> = {
  HEALTHY: 'Sano',
  CARIES: 'Caries',
  RESTORATION: 'Restauración',
  TEMP_RESTORATION: 'Restauración provisoria',
  CROWN: 'Corona',
  ROOT_CANAL: 'Endodoncia',
  IMPLANT: 'Implante',
  FRACTURE: 'Fractura',
  MISSING: 'Ausente / extraído',
  EXTRACTION_INDICATED: 'Extracción indicada',
  SEALANT: 'Sellante',
  PROSTHESIS: 'Prótesis',
}

export const CONDITION_COLORS: Partial<Record<Condition, string>> = {
  CARIES: 'var(--destructive)',
  RESTORATION: 'var(--pro-blue)',
  TEMP_RESTORATION: 'var(--pro-amber)',
  SEALANT: 'var(--pro-green)',
  FRACTURE: 'var(--pro-orange)',
}

const WHOLE_TOOTH: Condition[] = ['CROWN', 'ROOT_CANAL', 'IMPLANT', 'MISSING', 'EXTRACTION_INDICATED', 'PROSTHESIS']

export function isWholeTooth(condition: Condition): boolean {
  return WHOLE_TOOTH.includes(condition)
}

const isUpper = (tooth: number) => [1, 2, 5, 6].includes(Math.floor(tooth / 10))
const isPatientRight = (tooth: number) => [1, 4, 5, 8].includes(Math.floor(tooth / 10))

export function surfaceAt(tooth: number, region: Region): Surface {
  if (region === 'center') return 'O'
  if (region === 'top') return isUpper(tooth) ? 'V' : 'L'
  if (region === 'bottom') return isUpper(tooth) ? 'L' : 'V'
  const towardMidline = isPatientRight(tooth) ? 'right' : 'left'
  return region === towardMidline ? 'M' : 'D'
}

export interface ToothView {
  surfaces: Partial<Record<Surface, Condition>>
  whole: Condition[]
}

export function toothViews(current: Odontogram['current']): Map<number, ToothView> {
  const views = new Map<number, ToothView>()
  for (const finding of current) {
    const view = views.get(finding.tooth) ?? { surfaces: {}, whole: [] }
    if (finding.surface) view.surfaces[finding.surface] = finding.condition
    else if (isWholeTooth(finding.condition)) view.whole.push(finding.condition)
    else for (const surface of ['M', 'D', 'V', 'L', 'O'] as Surface[]) view.surfaces[surface] = finding.condition
    views.set(finding.tooth, view)
  }
  return views
}
