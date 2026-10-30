import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import { isUniqueViolation } from '../../shared/prismaErrors.js'
import { recordActorAudit } from '../audit/audit.service.js'
import type { AuthContext } from '../auth/auth.types.js'
import { documentProblem } from './domain/document.js'
import { documentTypeOf, IMPORT_COLUMNS, normalizeHeader, parseCsv, toIsoDate, type ImportColumn } from './domain/csv.js'
import type { ImportPreviewDto, ImportResultDto } from './import.schemas.js'
import { createPatientSchema, type CreatePatientInput } from './patients.schemas.js'
import { newPatientData } from './patients.service.js'

const MAX_ROWS = 2000

interface CheckedRow {
  line: number
  raw: Record<ImportColumn, string>
  input: CreatePatientInput | null
  errors: string[]
}

async function check(db: Db, actor: AuthContext, csv: string): Promise<CheckedRow[]> {
  const [header, ...lines] = parseCsv(csv)
  if (!header) throw new AppError(422, 'EMPTY_IMPORT', 'El archivo no tiene filas')
  const positions = header.map(normalizeHeader)
  const missing = IMPORT_COLUMNS.filter((column) => !positions.includes(column))
  if (missing.length > 0) {
    throw new AppError(422, 'INVALID_IMPORT_HEADER', `Faltan columnas en el encabezado: ${missing.join(', ')}`)
  }
  if (lines.length === 0) throw new AppError(422, 'EMPTY_IMPORT', 'El archivo no tiene pacientes')
  if (lines.length > MAX_ROWS) throw new AppError(422, 'IMPORT_TOO_LARGE', `Se importan hasta ${MAX_ROWS} pacientes por archivo`)

  const rows: CheckedRow[] = lines.map((cells, index) => {
    const raw = Object.fromEntries(
      IMPORT_COLUMNS.map((column) => [column, (cells[positions.indexOf(column)] ?? '').trim()]),
    ) as Record<ImportColumn, string>
    const errors: string[] = []
    const documentType = documentTypeOf(raw.tipo_documento)
    if (!documentType) errors.push(`Tipo de documento desconocido: ${raw.tipo_documento}`)
    const birthDate = toIsoDate(raw.fecha_nacimiento)
    if (raw.fecha_nacimiento && !birthDate) errors.push('Fecha de nacimiento con formato inválido (usá dd/mm/aaaa)')
    const parsed = createPatientSchema.safeParse({
      firstName: raw.nombre,
      lastName: raw.apellido,
      documentType: documentType ?? 'DNI',
      documentNumber: raw.documento,
      birthDate: birthDate ?? (raw.fecha_nacimiento ? '' : undefined),
      phone: raw.telefono,
      email: raw.email,
      address: raw.direccion,
    })
    if (!parsed.success) errors.push(...new Set(parsed.error.issues.map((issue) => issue.message)))
    const problem = parsed.success ? documentProblem(parsed.data.documentType, parsed.data.documentNumber) : null
    if (problem) errors.push(problem)
    return { line: index + 2, raw, input: parsed.success && errors.length === 0 ? parsed.data : null, errors }
  })

  const seen = new Map<string, number>()
  for (const row of rows) {
    if (!row.input) continue
    const key = `${row.input.documentType}:${row.input.documentNumber}`
    const first = seen.get(key)
    if (first !== undefined) {
      row.errors.push(`Documento repetido en el archivo (fila ${first})`)
      row.input = null
    } else {
      seen.set(key, row.line)
    }
  }

  const candidates = rows.flatMap((row) => (row.input ? [row.input] : []))
  const existing = await db.patient.findMany({
    where: {
      organizationId: actor.organizationId,
      OR: candidates.map((c) => ({ documentType: c.documentType, documentNumber: c.documentNumber })),
    },
    select: { documentType: true, documentNumber: true },
  })
  const taken = new Set(existing.map((p) => `${p.documentType}:${p.documentNumber ?? ''}`))
  for (const row of rows) {
    if (row.input && taken.has(`${row.input.documentType}:${row.input.documentNumber}`)) {
      row.errors.push('Ya existe un paciente con ese documento')
      row.input = null
    }
  }
  return rows
}

export async function previewImport(db: Db, actor: AuthContext, csv: string): Promise<ImportPreviewDto> {
  const rows = await check(db, actor, csv)
  return {
    rows: rows.map((row) => ({
      line: row.line,
      firstName: row.raw.nombre,
      lastName: row.raw.apellido,
      documentType: row.raw.tipo_documento || 'DNI',
      documentNumber: row.raw.documento,
      birthDate: row.raw.fecha_nacimiento,
      errors: row.errors,
    })),
    valid: rows.filter((row) => row.input).length,
    invalid: rows.filter((row) => !row.input).length,
  }
}

export async function importPatients(db: Db, actor: AuthContext, csv: string): Promise<ImportResultDto> {
  const rows = await check(db, actor, csv)
  const valid = rows.flatMap((row) => (row.input ? [row.input] : []))
  if (valid.length === 0) throw new AppError(422, 'NOTHING_TO_IMPORT', 'No hay filas válidas para importar')
  try {
    await db.$transaction(async (tx) => {
      await tx.patient.createMany({ data: valid.map((input) => newPatientData(actor.organizationId, input)) })
      await recordActorAudit(tx, actor, {
        action: 'PATIENTS_IMPORTED',
        entityType: 'Patient',
        metadata: { importados: valid.length, omitidos: rows.length - valid.length },
      })
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'DUPLICATE_PATIENT', 'Otro usuario cargó alguno de esos documentos mientras tanto: volvé a revisar el archivo')
    }
    throw err
  }
  return { created: valid.length, skipped: rows.length - valid.length }
}
