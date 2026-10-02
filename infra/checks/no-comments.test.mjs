import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findComments, stripComments, trackedFiles } from './no-comments.mjs'

const count = (file, text) => findComments(file, text).length
const strip = (file, text) => stripComments(text, findComments(file, text))

test('ts: detecta comentarios de linea y de bloque, no el texto de strings ni templates', () => {
  const text = "const a = 'http://x' // nota\nconst b = `//${a}`\n/* bloque */\n"
  assert.equal(count('a.ts', text), 2)
})

test('tsx: detecta el comentario de jsx y no el texto con barras', () => {
  const text = 'export const x = <div>{/* nota */}//texto</div>\n'
  assert.equal(count('a.tsx', text), 1)
})

test('sql: ignora los guiones dentro de strings y de cuerpos entre $$', () => {
  const text = "SELECT '--no';\n-- si\nCREATE FUNCTION f() AS $$ SELECT '--no' $$;\n"
  assert.equal(count('a.sql', text), 1)
})

test('prisma: detecta // fuera de strings', () => {
  const text = 'model A {\n  name String // nota\n  url String @default("a//b")\n}\n'
  assert.equal(count('a.prisma', text), 1)
})

test('yaml y env: el # dentro de comillas o pegado a un valor no es comentario', () => {
  assert.equal(count('a.yml', "a: 'x # y'\nb: c # nota\nd: \"#/ref\"\n"), 1)
  assert.equal(count('.env.example', 'A=1#2\n# nota\n'), 1)
})

test('dockerfile: las directivas syntax y escape no son comentarios', () => {
  const text = '# syntax=docker/dockerfile:1\n# nota\nFROM node:22\n'
  assert.equal(count('Dockerfile', text), 1)
})

test('strip: borra la linea entera o solo el comentario final', () => {
  assert.equal(strip('a.ts', 'const a = 1 // nota\n// sola\nconst b = 2\n'), 'const a = 1\nconst b = 2\n')
})

test('strip: respeta CRLF y no deja lineas en blanco de mas', () => {
  assert.equal(strip('a.ts', 'a\r\n// x\r\n\r\nb\r\n'), 'a\r\n\r\nb\r\n')
  assert.equal(strip('a.ts', 'a\n\n// x\n\nb\n'), 'a\n\nb\n')
})

test('un archivo sin comentarios queda igual', () => {
  const text = 'export const a = 1\n'
  assert.equal(strip('a.ts', text), text)
})

test('trackedFiles solo devuelve archivos que existen en disco', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const files = trackedFiles()
  assert.ok(files.length > 0)
  assert.ok(files.every((file) => existsSync(path.join(root, file))))
})
