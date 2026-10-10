import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import type { AuthContext } from '../auth/auth.types.js'

export async function findPatientOrFail(db: Pick<Db, 'patient'>, actor: AuthContext, patientId: string) {
  const patient = await db.patient.findFirst({ where: { id: patientId, organizationId: actor.organizationId } })
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'El paciente no existe')
  return patient
}

export async function writableProfile(db: Pick<Db, 'patient' | 'professionalProfile'>, actor: AuthContext, patientId: string) {
  const patient = await findPatientOrFail(db, actor, patientId)
  if (patient.archivedAt) {
    throw new AppError(422, 'PATIENT_ARCHIVED', 'El paciente está archivado: reactivalo para registrar información clínica')
  }
  const profile = await db.professionalProfile.findFirst({
    where: { userId: actor.userId, active: true, user: { organizationId: actor.organizationId } },
  })
  if (!profile) {
    throw new AppError(422, 'PROFESSIONAL_PROFILE_REQUIRED', 'Tu usuario no tiene un perfil profesional activo')
  }
  return profile
}
