import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stringify } from 'yaml'
import { buildOpenApiDocument } from '../src/openapi/document.js'

const destino = resolve(import.meta.dirname, '../../docs/openapi.yaml')
const contenido = stringify(buildOpenApiDocument())

if (process.argv.includes('--check')) {
  const actual = existsSync(destino) ? readFileSync(destino, 'utf8') : ''
  if (actual !== contenido) {
    console.error('docs/openapi.yaml esta desactualizado. correr: npm run openapi:export')
    process.exit(1)
  }
  console.log('docs/openapi.yaml esta al dia')
} else {
  writeFileSync(destino, contenido)
  console.log(`openapi exportado a ${destino}`)
}
