export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

interface Searchable {
  firstName: string
  lastName: string
  documentNumber: string | null
  phone: string | null
}

export function buildSearchText({ firstName, lastName, documentNumber, phone }: Searchable): string {
  return [
    normalizeText(lastName),
    normalizeText(firstName),
    digitsOnly(documentNumber ?? ''),
    digitsOnly(phone ?? ''),
  ]
    .filter(Boolean)
    .join(' ')
}

export function escapeLike(token: string): string {
  return token.replace(/[\\%_]/g, '\\$&')
}

export function searchTokens(query: string): string[] {
  return normalizeText(query)
    .split(' ')
    .filter(Boolean)
    .map((token) => (/^[\d.\-()+]+$/.test(token) ? digitsOnly(token) : token))
    .filter(Boolean)
}
