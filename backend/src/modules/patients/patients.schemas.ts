import { z } from 'zod'
import { normalizeDocumentNumber } from './domain/document.js'

const documentTypeSchema = z.enum(['DNI', 'LE', 'LC', 'PASAPORTE', 'OTRO']).meta({ id: 'DocumentType' })

const nameSchema = (label: string) => z.string().trim().min(1, `Ingresá ${label}`).max(80)

const optionalText = (max: number, valid?: (value: string) => boolean, message = 'Valor inválido') =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => value === '' || !valid || valid(value), { message })
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()

const phoneSchema = optionalText(40, (value) => /^[\d\s+()-]{6,40}$/.test(value), 'Teléfono inválido')
const emailSchema = optionalText(120, (value) => z.email().safeParse(value).success, 'Email inválido')

const documentNumberSchema = z
  .string()
  .trim()
  .max(24)
  .transform((value) => (value === '' ? null : normalizeDocumentNumber(value)))
  .nullable()
  .optional()

const birthDateSchema = z.iso
  .date('Fecha de nacimiento inválida')
  .refine((value) => value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10), {
    message: 'La fecha de nacimiento no es válida',
  })
  .nullable()
  .optional()

const patientFields = {
  firstName: nameSchema('el nombre'),
  lastName: nameSchema('el apellido'),
  documentType: documentTypeSchema,
  documentNumber: documentNumberSchema,
  birthDate: birthDateSchema,
  phone: phoneSchema,
  email: emailSchema,
  address: optionalText(200),
}

export const createPatientSchema = z
  .object({ ...patientFields, documentType: documentTypeSchema.default('DNI') })
  .meta({ id: 'CreatePatientInput' })

export const updatePatientSchema = z
  .object(patientFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios para guardar' })
  .meta({ id: 'UpdatePatientInput' })

export const patientIdParamsSchema = z.object({ id: z.uuid() })

export const archivePatientSchema = z
  .object({ cancelActiveAppointments: z.boolean().default(false) })
  .meta({ id: 'ArchivePatientInput' })

export const listPatientsQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

export const patientSchema = z
  .object({
    id: z.uuid(),
    firstName: z.string(),
    lastName: z.string(),
    documentType: documentTypeSchema,
    documentNumber: z.string().nullable(),
    birthDate: z.iso.date().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    archivedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Patient' })

export const patientListSchema = z
  .object({
    items: z.array(patientSchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .meta({ id: 'PatientList' })

export type PatientDto = z.infer<typeof patientSchema>
export type CreatePatientInput = z.infer<typeof createPatientSchema>
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>
export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>
