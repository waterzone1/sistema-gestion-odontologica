export type AllowedMime = 'application/pdf' | 'image/jpeg' | 'image/png'

const SIGNATURES: { mime: AllowedMime; bytes: number[] }[] = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
]

const EXTENSIONS: Record<AllowedMime, string[]> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
}

export function detectMime(content: Uint8Array): AllowedMime | null {
  const match = SIGNATURES.find((signature) => signature.bytes.every((byte, index) => content[index] === byte))
  return match?.mime ?? null
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 120)
  return cleaned || 'archivo'
}

export function extensionMatches(filename: string, mime: AllowedMime): boolean {
  const extension = filename.toLowerCase().split('.').pop() ?? ''
  return EXTENSIONS[mime].includes(extension)
}
