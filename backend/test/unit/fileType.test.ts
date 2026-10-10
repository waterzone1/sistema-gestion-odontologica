import { describe, expect, it } from 'vitest'
import { detectMime, extensionMatches, sanitizeFilename } from '../../src/modules/files/domain/fileType.js'

const bytes = (...values: number[]) => Uint8Array.from(values)

describe('detectMime', () => {
  it('reconoce PDF, PNG y JPEG por su contenido', () => {
    expect(detectMime(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toBe('application/pdf')
    expect(detectMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png')
    expect(detectMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
  })

  it('rechaza otros formatos aunque se llamen .pdf', () => {
    expect(detectMime(new TextEncoder().encode('<html><script>'))).toBeNull()
    expect(detectMime(bytes(0x4d, 0x5a, 0x90))).toBeNull()
    expect(detectMime(bytes())).toBeNull()
  })
})

describe('sanitizeFilename', () => {
  it('quita rutas y caracteres peligrosos y conserva tildes', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFilename('C:\\fotos\\radiografía 1.png')).toBe('radiografía 1.png')
    expect(sanitizeFilename('informe<script>.pdf')).toBe('informe_script_.pdf')
    expect(sanitizeFilename('...')).toBe('archivo')
  })

  it('limita el largo', () => {
    expect(sanitizeFilename(`${'a'.repeat(300)}.pdf`)).toHaveLength(120)
  })
})

describe('extensionMatches', () => {
  it('compara la extension con el tipo real', () => {
    expect(extensionMatches('estudio.PDF', 'application/pdf')).toBe(true)
    expect(extensionMatches('foto.jpeg', 'image/jpeg')).toBe(true)
    expect(extensionMatches('foto.png', 'image/jpeg')).toBe(false)
  })
})
