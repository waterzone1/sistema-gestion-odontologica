export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '')
  const firstLine = source.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"' && cell === '') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ''))
}

export const IMPORT_COLUMNS = [
  'nombre',
  'apellido',
  'tipo_documento',
  'documento',
  'fecha_nacimiento',
  'telefono',
  'email',
  'direccion',
] as const

export type ImportColumn = (typeof IMPORT_COLUMNS)[number]

const DOCUMENT_TYPES: Record<string, 'DNI' | 'LE' | 'LC' | 'PASAPORTE' | 'OTRO'> = {
  '': 'DNI',
  dni: 'DNI',
  le: 'LE',
  lc: 'LC',
  pasaporte: 'PASAPORTE',
  otro: 'OTRO',
}

export function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
}

export function toIsoDate(value: string): string | null {
  const text = value.trim()
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
  if (local) return `${local[3]}-${local[2]?.padStart(2, '0')}-${local[1]?.padStart(2, '0')}`
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

export function documentTypeOf(value: string) {
  return DOCUMENT_TYPES[value.trim().toLowerCase()] ?? null
}

export const TEMPLATE_ROWS: string[][] = [
  [...IMPORT_COLUMNS],
  ['Ana', 'Gómez', 'DNI', '30123456', '10/03/1985', '11 5555-1234', 'ana@ejemplo.com', 'Av. Siempre Viva 742'],
]
