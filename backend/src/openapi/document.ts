import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import { registerAppointmentsDocs } from '../modules/appointments/appointments.docs.js'
import { registerAuthDocs } from '../modules/auth/auth.docs.js'
import { registerBranchesDocs } from '../modules/branches/branches.docs.js'
import { registerHealthDocs } from '../modules/health/health.docs.js'
import { registerPatientImportDocs } from '../modules/patients/import.docs.js'
import { registerPatientNotesDocs } from '../modules/patients/notes.docs.js'
import { registerPatientsDocs } from '../modules/patients/patients.docs.js'
import { registerAvailabilityDocs } from '../modules/availability/availability.docs.js'
import { registerBillingDocs } from '../modules/billing/billing.docs.js'
import { registerCashDocs } from '../modules/cash/cash.docs.js'
import { registerCoveragesDocs } from '../modules/coverages/coverages.docs.js'
import { registerLiquidationsDocs } from '../modules/liquidations/liquidations.docs.js'
import { registerAuditDocs } from '../modules/audit/audit.docs.js'
import { registerRemindersDocs } from '../modules/reminders/reminders.docs.js'
import { registerReportsDocs } from '../modules/reports/reports.docs.js'
import { registerBackupsDocs } from '../modules/backups/backups.docs.js'
import { registerFilesDocs } from '../modules/files/files.docs.js'
import { registerTreatmentDocs } from '../modules/treatment/treatment.docs.js'
import { registerOdontogramDocs } from '../modules/odontogram/odontogram.docs.js'
import { registerClinicalDocs } from '../modules/clinical/clinical.docs.js'
import { registerPracticesDocs } from '../modules/practices/practices.docs.js'
import { registerProfessionalsDocs } from '../modules/professionals/professionals.docs.js'
import { registerUsersDocs } from '../modules/users/users.docs.js'

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry()
  registerHealthDocs(registry)
  registerAuthDocs(registry)
  registerUsersDocs(registry)
  registerBranchesDocs(registry)
  registerProfessionalsDocs(registry)
  registerPatientsDocs(registry)
  registerPatientNotesDocs(registry)
  registerPatientImportDocs(registry)
  registerAvailabilityDocs(registry)
  registerBillingDocs(registry)
  registerCashDocs(registry)
  registerCoveragesDocs(registry)
  registerLiquidationsDocs(registry)
  registerAuditDocs(registry)
  registerReportsDocs(registry)
  registerRemindersDocs(registry)
  registerBackupsDocs(registry)
  registerClinicalDocs(registry)
  registerFilesDocs(registry)
  registerOdontogramDocs(registry)
  registerTreatmentDocs(registry)
  registerPracticesDocs(registry)
  registerAppointmentsDocs(registry)

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Sistema de Gestión Odontológica - API',
      version: '0.2.0',
      description:
        'API REST del backend. Se autentica con una cookie de sesión HttpOnly. Las escrituras ' +
        'requieren el header Origin de la aplicación y el token CSRF de la sesión. ' +
        'Los errores siguen el formato ErrorBody.',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'Health' },
      { name: 'Setup' },
      { name: 'Auth' },
      { name: 'Usuarios' },
      { name: 'Sedes' },
      { name: 'Profesionales' },
      { name: 'Pacientes' },
      { name: 'Prácticas' },
      { name: 'Turnos' },
    ],
  })
}
