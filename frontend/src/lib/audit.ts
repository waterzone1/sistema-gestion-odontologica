import { STATUS_LABELS } from './appointments'
import { PAYMENT_METHOD_LABELS } from './billing'
import { formatMoney } from './format'
import { ROLE_LABELS } from './permissions'

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  SETUP_COMPLETED: 'Instalación inicial',
  LOGIN_SUCCESS: 'Ingreso',
  LOGIN_FAILED: 'Ingreso fallido',
  LOGOUT: 'Salida',
  PASSWORD_CHANGED: 'Cambio de contraseña',
  USER_CREATED: 'Alta de usuario',
  USER_UPDATED: 'Usuario modificado',
  USER_ROLES_CHANGED: 'Cambio de roles',
  USER_PASSWORD_RESET: 'Contraseña restablecida',
  USER_DEACTIVATED: 'Usuario desactivado',
  USER_ACTIVATED: 'Usuario reactivado',
  USER_SESSIONS_REVOKED: 'Sesiones cerradas',
  BRANCH_CREATED: 'Alta de sede',
  BRANCH_UPDATED: 'Sede modificada',
  PROFESSIONAL_SAVED: 'Profesional guardado',
  PATIENT_CREATED: 'Alta de paciente',
  PATIENT_UPDATED: 'Paciente modificado',
  PATIENT_ARCHIVED: 'Paciente archivado',
  PATIENT_UNARCHIVED: 'Paciente reactivado',
  PATIENTS_IMPORTED: 'Importación de pacientes',
  REMINDERS_GENERATED: 'Recordatorios generados',
  PATIENT_NOTE_CREATED: 'Mensaje sobre paciente',
  PATIENT_NOTE_ARCHIVED: 'Mensaje archivado',
  PATIENT_COVERAGE_SAVED: 'Cobertura de paciente',
  PATIENT_COVERAGE_ARCHIVED: 'Cobertura de paciente archivada',
  PRACTICE_CREATED: 'Alta de práctica',
  PRACTICE_UPDATED: 'Práctica modificada',
  APPOINTMENT_CREATED: 'Alta de turno',
  APPOINTMENT_UPDATED: 'Turno modificado',
  APPOINTMENT_STATUS_CHANGED: 'Cambio de estado de turno',
  APPOINTMENT_CLOSED: 'Turno cerrado',
  APPOINTMENT_AVAILABILITY_OVERRIDE: 'Turno fuera de disponibilidad',
  APPOINTMENT_WARNINGS_ACCEPTED: 'Advertencias de turno aceptadas',
  AVAILABILITY_RULES_CHANGED: 'Horario modificado',
  AVAILABILITY_EXCEPTION_CREATED: 'Excepción de agenda',
  AVAILABILITY_EXCEPTION_REVOKED: 'Excepción revocada',
  CLINICAL_HISTORY_VIEWED: 'Consulta de historia clínica',
  CLINICAL_ENTRY_CREATED: 'Nota clínica',
  CLINICAL_ENTRY_CORRECTED: 'Corrección clínica',
  CLINICAL_PROFILE_VIEWED: 'Consulta de perfil clínico',
  CLINICAL_PROFILE_UPDATED: 'Perfil clínico actualizado',
  CLINICAL_FILE_UPLOADED: 'Archivo clínico subido',
  CLINICAL_FILE_DOWNLOADED: 'Archivo clínico descargado',
  CLINICAL_FILE_ARCHIVED: 'Archivo clínico archivado',
  ODONTOGRAM_UPDATED: 'Odontograma',
  TREATMENT_PLAN_CREATED: 'Plan de tratamiento creado',
  TREATMENT_ITEM_ADDED: 'Ítem de plan agregado',
  TREATMENT_ITEM_PRICED: 'Ítem cotizado',
  TREATMENT_PLAN_ACCEPTED: 'Presupuesto aceptado',
  TREATMENT_ITEM_COMPLETED: 'Ítem realizado',
  TREATMENT_ITEM_CANCELLED: 'Ítem cancelado',
  SERVICE_RECORDED: 'Prestación registrada',
  SERVICE_VOIDED: 'Prestación anulada',
  SERVICE_PRICE_CHANGED: 'Precio ajustado',
  PAYMENT_RECORDED: 'Pago registrado',
  PAYMENT_VOIDED: 'Pago anulado',
  CREDIT_APPLIED: 'Saldo a favor usado',
  CREDIT_VOIDED: 'Uso de saldo anulado',
  EXCHANGE_RATE_SET: 'Cotización del dólar',
  COVERAGE_SAVED: 'Cobertura guardada',
  AGREEMENT_SAVED: 'Convenio guardado',
  LIQUIDATION_CREATED: 'Liquidación armada',
  LIQUIDATION_SUBMITTED: 'Liquidación presentada',
  LIQUIDATION_ITEM_RESOLVED: 'Resultado de liquidación',
  LIQUIDATION_PAID: 'Liquidación pagada',
  LIQUIDATION_CANCELLED: 'Liquidación anulada',
  LIQUIDATION_EXPORTED: 'Liquidación exportada',
  BACKUP_STARTED: 'Backup iniciado',
  BACKUP_COMPLETED: 'Backup completado',
  BACKUP_FAILED: 'Backup fallido',
  BACKUP_RESTORED: 'Restauración desde backup',
  ORGANIZATION_MODULES_UPDATED: 'Módulos de la organización',
  ORGANIZATION_UPDATED: 'Datos del consultorio',
  ORGANIZATION_SETTINGS_UPDATED: 'Ajustes del consultorio',
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action
}

const FIELD_LABELS: Record<string, string> = {
  firstName: 'nombre',
  lastName: 'apellido',
  documentType: 'tipo de documento',
  documentNumber: 'documento',
  birthDate: 'fecha de nacimiento',
  phone: 'teléfono',
  phoneHasWhatsapp: 'WhatsApp',
  email: 'email',
  address: 'dirección',
  notes: 'notas',
  startsAt: 'horario',
  endsAt: 'horario',
  professionalId: 'profesional',
  practiceId: 'práctica',
  branchId: 'sede',
  branchIds: 'sedes',
  active: 'activo',
  displayName: 'nombre',
  roles: 'roles',
  licenseNumber: 'matrícula',
  color: 'color',
  name: 'nombre',
  code: 'código',
  basePrice: 'precio',
  defaultDurationMinutes: 'duración',
  practiceIds: 'prácticas',
}

const RESULT_LABELS: Record<string, string> = { APPROVED: 'aprobada', DEBITED: 'con débito', REJECTED: 'rechazada' }

const money = (value: unknown, currency: unknown = 'ARS') =>
  typeof value === 'string' || typeof value === 'number' ? formatMoney(String(value), currency === 'USD' ? 'USD' : 'ARS') : ''

const statusLabel = (value: unknown) =>
  typeof value === 'string' && value in STATUS_LABELS ? STATUS_LABELS[value as keyof typeof STATUS_LABELS].toLowerCase() : String(value)

const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : [String(value)])

export function auditDetails(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return []
  const m = metadata
  const details: string[] = []
  if (m['desde'] !== undefined && m['hacia'] !== undefined) details.push(`De ${statusLabel(m['desde'])} a ${statusLabel(m['hacia'])}`)
  else if (m['hacia'] !== undefined) details.push(`Pasó a ${statusLabel(m['hacia'])}`)
  if (Array.isArray(m['campos'])) {
    const fields = [...new Set(m['campos'].map((field) => FIELD_LABELS[String(field)] ?? String(field)))]
    if (fields.length > 0) details.push(`Cambió: ${fields.join(', ')}`)
  }
  if (m['reprogramado'] === true) details.push('Reprogramado')
  if (m['reactivado'] === true) details.push('Reactivado')
  if (m['porRecordatorio'] === true) details.push('Confirmado desde recordatorios')
  if (m['before'] !== undefined && m['after'] !== undefined) details.push(`De ${money(m['before'])} a ${money(m['after'])} por dólar`)
  if (m['rate'] !== undefined) details.push(`Cotización ${money(m['rate'])}`)
  if (m['precioAntes'] !== undefined && m['precioDespues'] !== undefined) details.push(`De ${money(m['precioAntes'])} a ${money(m['precioDespues'])}`)
  if (m['originalAmount'] !== undefined) details.push(money(m['originalAmount'], m['currency']))
  else if (m['amount'] !== undefined) details.push(money(m['amount']))
  if (typeof m['method'] === 'string') details.push(PAYMENT_METHOD_LABELS[m['method'] as keyof typeof PAYMENT_METHOD_LABELS] ?? m['method'])
  if (m['price'] !== undefined) details.push(`Importe ${money(m['price'])}`)
  if (m['precio'] !== undefined) details.push(`Precio ${money(m['precio'])}`)
  if (m['importe'] !== undefined) details.push(`Importe ${money(m['importe'])}`)
  if (m['aprobado'] !== undefined) details.push(`Aprobado ${money(m['aprobado'])}`)
  if (m['estado'] !== undefined) details.push(`Resultado: ${RESULT_LABELS[String(m['estado'])] ?? String(m['estado'])}`)
  if (m['codigo'] !== undefined) details.push(`Código ${String(m['codigo'])}`)
  if (m['pieza'] !== undefined) details.push(`Pieza ${String(m['pieza'])}`)
  if (m['username'] !== undefined) details.push(`Usuario ${String(m['username'])}`)
  if (m['roles'] !== undefined) details.push(`Roles: ${list(m['roles']).map((role) => ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role).join(', ')}`)
  if (m['cantidad'] !== undefined) details.push(`${String(m['cantidad'])} en total`)
  if (m['importados'] !== undefined) details.push(`${String(m['importados'])} importados`)
  if (m['omitidos'] !== undefined) details.push(`${String(m['omitidos'])} omitidos`)
  if (m['sesionesRevocadas'] !== undefined) details.push(`${String(m['sesionesRevocadas'])} sesiones cerradas`)
  if (m['coberturas'] !== undefined) details.push(m['coberturas'] ? 'Coberturas activadas' : 'Coberturas desactivadas')
  if (Array.isArray(m['advertencias'])) details.push(...m['advertencias'].map(String))
  if (Array.isArray(m['secciones'])) {
    const names: Record<string, string> = { backups: 'backups', reminders: 'recordatorios', files: 'archivos', sessions: 'sesiones' }
    details.push(`Cambió: ${m['secciones'].map((key) => names[String(key)] ?? String(key)).join(', ')}`)
  }
  if (m['reabreAceptacion'] === true) details.push('El presupuesto vuelve a requerir aceptación')
  const reason = m['motivo'] ?? m['reason']
  if (typeof reason === 'string' && reason !== '') details.push(`Motivo: ${reason}`)
  return details
}
