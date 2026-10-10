import type { Professional } from './api'

export type ProfessionalColor = NonNullable<Professional['color']>

export const PROFESSIONAL_COLORS: { value: ProfessionalColor; label: string }[] = [
  { value: 'teal', label: 'Turquesa' },
  { value: 'blue', label: 'Azul' },
  { value: 'indigo', label: 'Índigo' },
  { value: 'violet', label: 'Violeta' },
  { value: 'pink', label: 'Rosa' },
  { value: 'red', label: 'Rojo' },
  { value: 'orange', label: 'Naranja' },
  { value: 'amber', label: 'Ámbar' },
  { value: 'green', label: 'Verde' },
  { value: 'slate', label: 'Gris' },
]

export function colorVar(color: Professional['color']): string {
  return color ? `var(--pro-${color})` : 'var(--primary)'
}
