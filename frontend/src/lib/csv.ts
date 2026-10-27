function cell(value: string | number): string {
  const text = String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return `${String.fromCharCode(0xfeff)}${rows.map((row) => row.map(cell).join(';')).join('\r\n')}\r\n`
}

export function downloadCsv(filename: string, rows: readonly (readonly (string | number)[])[]): void {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export const csvAmount = (amount: string) => amount.replace('.', ',')
