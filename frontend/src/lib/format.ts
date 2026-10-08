import type { Patient } from './api'

export function ageFrom(birthDate: string, today: Date = new Date()): number {
  const [year, month, day] = birthDate.split('-').map(Number) as [number, number, number]
  const age = today.getFullYear() - year
  const month0 = today.getMonth() + 1
  const hadBirthday = month0 > month || (month0 === month && today.getDate() >= day)
  return hadBirthday ? age : age - 1
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

export function formatDocumentNumber(type: Patient['documentType'], number: string): string {
  if ((type === 'DNI' || type === 'LE' || type === 'LC') && /^\d+$/.test(number)) {
    return number.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  }
  return number
}

export function documentLabel(patient: Pick<Patient, 'documentType' | 'documentNumber'>): string {
  if (!patient.documentNumber) return 'Sin documento'
  return `${patient.documentType} ${formatDocumentNumber(patient.documentType, patient.documentNumber)}`
}

export function fullName(patient: Pick<Patient, 'lastName' | 'firstName'>): string {
  return `${patient.lastName}, ${patient.firstName}`
}
