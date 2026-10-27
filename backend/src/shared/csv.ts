const BOM = String.fromCharCode(0xfeff)

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return `${BOM}${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`
}
