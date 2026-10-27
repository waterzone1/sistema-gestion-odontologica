import type { ClinicalFile } from './api'

export const FILE_CATEGORY_LABELS: Record<ClinicalFile['category'], string> = {
  XRAY: 'Radiografía',
  STUDY: 'Estudio',
  PHOTO: 'Foto',
  CONSENT: 'Consentimiento',
  OTHER: 'Otro',
}

const MAX_FILE_MB = 20

const ALLOWED = /\.(pdf|jpe?g|png)$/i

export function fileProblem(file: Pick<File, 'name' | 'size'>): string | null {
  if (!ALLOWED.test(file.name)) return 'Solo se aceptan archivos PDF, JPG o PNG'
  if (file.size === 0) return 'El archivo está vacío'
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `El archivo supera los ${MAX_FILE_MB} MB`
  return null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
