import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
function loadTypescript() {
  for (const pkg of ['backend', 'frontend']) {
    try {
      return createRequire(path.join(root, pkg, 'package.json'))('typescript')
    } catch {
      continue
    }
  }
  throw new Error('typescript no esta instalado: correr npm ci en backend o frontend')
}

const ts = loadTypescript()

const SKIPPED = /(^|\/)(node_modules|dist|\.next|generated|test-results)\//
const HASH_FILES = new Set(['Caddyfile', '.gitignore', '.gitattributes', '.dockerignore', '.editorconfig'])

function kindOf(file) {
  const name = path.basename(file)
  if (/\.(ts|tsx|js|mjs|cjs)$/.test(file)) return 'script'
  if (file.endsWith('.css')) return 'css'
  if (file.endsWith('.sql')) return 'sql'
  if (file.endsWith('.prisma')) return 'prisma'
  if (/\.ya?ml$/.test(file)) return 'hash'
  if (name === 'Dockerfile') return 'dockerfile'
  if (HASH_FILES.has(name) || name.startsWith('.env')) return 'hash'
  return null
}

function scriptRanges(text, file) {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const starts = new Map()
  const jsxTexts = []
  const collect = (ranges) => {
    for (const range of ranges ?? []) starts.set(range.pos, range.end)
  }
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) jsxTexts.push([node.getFullStart(), node.getEnd()])
    collect(ts.getLeadingCommentRanges(text, node.getFullStart()))
    collect(ts.getTrailingCommentRanges(text, node.getEnd()))
    node.getChildren(source).forEach(visit)
  }
  visit(source)
  const insideJsxText = (pos) => jsxTexts.some(([from, to]) => pos >= from && pos < to)
  return [...starts].filter(([start]) => !insideJsxText(start)).map(([start, end]) => ({ start, end }))
}

function tokenRanges(text, { line, block, dollar = false, hashRule = false }) {
  const ranges = []
  let quote = null
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (hashRule && ch === '\n') {
      quote = null
      i += 1
      continue
    }
    if (quote) {
      if (ch === '\\' && quote !== '$$') i += 1
      else if (text.startsWith(quote, i)) {
        i += quote.length - 1
        quote = null
      }
    } else if (ch === '"' || ch === "'") quote = ch
    else if (dollar && text.startsWith('$$', i)) {
      quote = '$$'
      i += 1
    } else if (block && text.startsWith(block[0], i)) {
      const close = text.indexOf(block[1], i + block[0].length)
      const end = close === -1 ? text.length : close + block[1].length
      ranges.push({ start: i, end })
      i = end - 1
    } else if (line && text.startsWith(line, i)) {
      const startsWord = !hashRule || i === 0 || /\s/.test(text[i - 1])
      if (startsWord) {
        const newline = text.indexOf('\n', i)
        const end = newline === -1 ? text.length : newline
        ranges.push({ start: i, end })
        i = end - 1
      }
    }
    i += 1
  }
  return ranges
}

function dockerfileRanges(text) {
  const ranges = []
  let offset = 0
  for (const row of text.split('\n')) {
    const content = row.trimStart()
    const isDirective = /^#\s*(syntax|escape|check)\s*=/i.test(content)
    if (content.startsWith('#') && !isDirective) ranges.push({ start: offset, end: offset + row.length })
    offset += row.length + 1
  }
  return ranges
}

export function findComments(file, text) {
  switch (kindOf(file)) {
    case 'script':
      return scriptRanges(text, file)
    case 'css':
      return tokenRanges(text, { block: ['/*', '*/'] })
    case 'sql':
      return tokenRanges(text, { line: '--', block: ['/*', '*/'], dollar: true })
    case 'prisma':
      return tokenRanges(text, { line: '//' })
    case 'hash':
      return tokenRanges(text, { line: '#', hashRule: true })
    case 'dockerfile':
      return dockerfileRanges(text)
    default:
      return []
  }
}

export function stripComments(text, ranges) {
  let result = text
  for (const { start, end } of [...ranges].sort((a, b) => b.start - a.start)) {
    const lineStart = result.lastIndexOf('\n', start - 1) + 1
    const newline = result.indexOf('\n', end)
    const lineEnd = newline === -1 ? result.length : newline
    const before = result.slice(lineStart, start)
    const after = result.slice(end, lineEnd)
    if (before.trim() === '' && after.trim() === '') {
      result = result.slice(0, lineStart) + result.slice(Math.min(lineEnd + 1, result.length))
    } else {
      result = result.slice(0, start).trimEnd() + result.slice(end)
    }
  }
  return result
    .replace(/(?:\r?\n){3,}/g, (blank) => (blank.includes('\r') ? '\r\n\r\n' : '\n\n'))
    .replace(/^(?:\r?\n)+/, '')
}

export function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
  })
  return out
    .split('\0')
    .filter(Boolean)
    .filter((file) => !SKIPPED.test(file) && kindOf(file) && existsSync(path.join(root, file)))
}

function lineOf(text, offset) {
  return text.slice(0, offset).split('\n').length
}

function main() {
  const args = process.argv.slice(2)
  const fix = args.includes('--fix')
  const targets = args.filter((arg) => arg !== '--fix').map((arg) => path.resolve(process.cwd(), arg))

  const files = trackedFiles().filter((file) => {
    const absolute = path.join(root, file)
    return targets.length === 0 || targets.some((target) => absolute === target || absolute.startsWith(target + path.sep))
  })

  const findings = []
  for (const file of files) {
    const absolute = path.join(root, file)
    const text = readFileSync(absolute, 'utf8')
    const ranges = findComments(file, text)
    if (fix) {
      const cleaned = stripComments(text, ranges)
      if (cleaned !== text) writeFileSync(absolute, cleaned)
    } else {
      for (const range of ranges) findings.push(`${file}:${lineOf(text, range.start)}`)
    }
  }

  if (fix) {
    console.log('comentarios eliminados')
    return
  }
  if (findings.length > 0) {
    console.error(`se encontraron ${findings.length} comentarios:`)
    for (const finding of findings) console.error(`  ${finding}`)
    process.exit(1)
  }
  console.log(`sin comentarios (${files.length} archivos revisados)`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
