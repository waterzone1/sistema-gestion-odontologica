import { describe, expect, it } from 'vitest'
import { documentTypeOf, normalizeHeader, parseCsv, toIsoDate } from '../../src/modules/patients/domain/csv.js'

describe('lectura de CSV', () => {
  it('detecta punto y coma o coma, ignora el BOM y las lineas vacias', () => {
    expect(parseCsv('﻿a;b\r\n1;2\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('respeta comillas, separadores y comillas dobles dentro de un campo', () => {
    expect(parseCsv('nombre;direccion\nAna;"Calle 1; piso ""2"""')).toEqual([
      ['nombre', 'direccion'],
      ['Ana', 'Calle 1; piso "2"'],
    ])
  })

  it('normaliza encabezados, fechas y tipos de documento', () => {
    expect(normalizeHeader(' Fecha Nacimiento ')).toBe('fecha_nacimiento')
    expect(normalizeHeader('Teléfono')).toBe('telefono')
    expect(toIsoDate('5/3/1985')).toBe('1985-03-05')
    expect(toIsoDate('1985-03-05')).toBe('1985-03-05')
    expect(toIsoDate('marzo')).toBeNull()
    expect(documentTypeOf('')).toBe('DNI')
    expect(documentTypeOf('Pasaporte')).toBe('PASAPORTE')
    expect(documentTypeOf('CUIT')).toBeNull()
  })
})
