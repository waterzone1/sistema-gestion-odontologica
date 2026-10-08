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

const pad = (value: number) => String(value).padStart(2, '0')

export function formatTime(iso: string): string {
  const date = new Date(iso)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${formatTime(iso)}`
}

export function toDateTimeInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatMoney(amount: string): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(amount))
}
