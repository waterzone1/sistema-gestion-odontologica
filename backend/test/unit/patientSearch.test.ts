import { describe, expect, it } from 'vitest'
import { documentProblem, normalizeDocumentNumber } from '../../src/modules/patients/domain/document.js'
import {
  buildSearchText,
  digitsOnly,
  escapeLike,
  normalizeText,
  searchTokens,
} from '../../src/modules/patients/domain/search.js'

describe('normalizeText', () => {
  it('quita tildes, pasa a minusculas y compacta espacios', () => {
    expect(normalizeText('  GÓMEZ   Núñez ')).toBe('gomez nunez')
  })
})

describe('digitsOnly', () => {
  it('deja solo los digitos', () => {
    expect(digitsOnly('+54 9 (11) 5555-1234')).toBe('5491155551234')
  })
})

describe('buildSearchText', () => {
  it('junta apellido, nombre, documento y telefono normalizados', () => {
    const texto = buildSearchText({
      firstName: 'María José',
      lastName: 'Pérez',
      documentNumber: '30123456',
      phone: '11 5555-1234',
    })
    expect(texto).toBe('perez maria jose 30123456 1155551234')
  })

  it('omite los campos vacios', () => {
    expect(
      buildSearchText({ firstName: 'Ana', lastName: 'Díaz', documentNumber: null, phone: null }),
    ).toBe('diaz ana')
  })
})

describe('escapeLike', () => {
  it('escapa los comodines de LIKE para que se busquen como texto', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\')
    expect(escapeLike('gomez')).toBe('gomez')
  })
})

describe('searchTokens', () => {
  it('separa por palabras y normaliza', () => {
    expect(searchTokens('Ana  GÓM')).toEqual(['ana', 'gom'])
  })

  it('convierte documentos y telefonos con separadores a digitos', () => {
    expect(searchTokens('30.123.456')).toEqual(['30123456'])
    expect(searchTokens('11-5555')).toEqual(['115555'])
  })

  it('una consulta vacia no genera filtros', () => {
    expect(searchTokens('   ')).toEqual([])
  })
})

describe('documento', () => {
  it('normaliza puntos, espacios y guiones', () => {
    expect(normalizeDocumentNumber('30.123.456')).toBe('30123456')
    expect(normalizeDocumentNumber(' ab-12 345 ')).toBe('AB12345')
  })

  it('el DNI exige solo digitos entre 6 y 9', () => {
    expect(documentProblem('DNI', '30123456')).toBeNull()
    expect(documentProblem('DNI', '123')).not.toBeNull()
    expect(documentProblem('DNI', 'AB123456')).not.toBeNull()
  })

  it('el pasaporte admite letras y numeros', () => {
    expect(documentProblem('PASAPORTE', 'AAB123456')).toBeNull()
    expect(documentProblem('PASAPORTE', 'ab')).not.toBeNull()
  })

  it('sin documento no hay problema', () => {
    expect(documentProblem('DNI', null)).toBeNull()
  })
})
