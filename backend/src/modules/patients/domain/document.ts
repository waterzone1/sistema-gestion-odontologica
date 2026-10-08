type DocumentType = 'DNI' | 'LE' | 'LC' | 'PASAPORTE' | 'OTRO'

export function normalizeDocumentNumber(value: string): string {
  return value.replace(/[.\s-]/g, '').toUpperCase()
}

export function documentProblem(type: DocumentType, number: string | null): string | null {
  if (number === null) return null
  if (type === 'DNI' || type === 'LE' || type === 'LC') {
    return /^\d{6,9}$/.test(number) ? null : 'El documento debe tener entre 6 y 9 dígitos'
  }
  return /^[A-Z0-9]{4,20}$/.test(number) ? null : 'El documento debe tener entre 4 y 20 letras o números'
}
