import { exec } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { trackedFiles } from './no-comments.mjs'

const run = promisify(exec)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const FORBIDDEN = [
  { pattern: /\b(mock|fake|dummy|lorem)\w*/i, reason: 'dato o doble de prueba en codigo de produccion' },
  { pattern: /\b(TODO|FIXME|XXX|HACK)\b/, reason: 'pendiente sin resolver' },
  { pattern: /console\.(log|debug|trace)\(/, reason: 'salida de depuracion' },
  { pattern: /\bdebugger\b/, reason: 'debugger' },
]

function forbiddenPatterns() {
  const sources = trackedFiles().filter(
    (file) => /^(backend|frontend)\/src\/.*\.tsx?$/.test(file) && !file.endsWith('api-types.ts'),
  )
  return sources.flatMap((file) =>
    readFileSync(path.join(root, file), 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        FORBIDDEN.filter(({ pattern }) => pattern.test(line)).map(
          ({ reason }) => `${file}:${index + 1}  ${reason}: ${line.trim()}`,
        ),
      ),
  )
}

async function check(label, commandLine, cwd) {
  try {
    await run(commandLine, { cwd })
    return { label, ok: true, details: [] }
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim().split('\n')
    return { label, ok: false, details: output }
  }
}

const results = await Promise.all([
  check('sin comentarios', 'node infra/checks/no-comments.mjs', root),
  check('codigo muerto (backend)', 'npx knip', path.join(root, 'backend')),
  check('codigo muerto (frontend)', 'npx knip', path.join(root, 'frontend')),
  check('sin duplicacion', 'npm run duplicates --silent', path.join(root, 'backend')),
])

const found = forbiddenPatterns()
results.push({
  label: 'sin mocks, pendientes ni depuracion en src',
  ok: found.length === 0,
  details: found,
})

for (const { label, ok, details } of results) {
  console.log(`${ok ? 'ok   ' : 'FALLA'}  ${label}`)
  for (const line of ok ? [] : details) console.log(`      ${line}`)
}

if (results.some(({ ok }) => !ok)) process.exit(1)
console.log('\nrevision previa sin hallazgos')
