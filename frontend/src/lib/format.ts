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
  return toTimeText(new Date(iso))
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return `${toDateText(date)} ${toTimeText(date)}`
}

export function toDateText(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

export function toTimeText(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function maskDate(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8)
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return digits
}

export function maskTime(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
}

export function parseDateText(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim())
  if (!match) return null
  const [, day, month, year] = match as unknown as [string, string, string, string]
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) return null
  return `${year}-${month}-${day}`
}

export function parseDateTimeText(dateText: string, timeText: string): Date | null {
  const isoDate = parseDateText(dateText)
  const time = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeText.trim())
  if (!isoDate || !time) return null
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day, Number(time[1]), Number(time[2]))
}

export function formatMoney(amount: string): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(amount))
}
