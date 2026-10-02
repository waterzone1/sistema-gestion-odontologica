import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '../..')

const E2E_ORIGIN = 'https://localhost:8443'

function composeEnv(): NodeJS.ProcessEnv {
  process.env['E2E_DB_PASSWORD'] ??= randomBytes(12).toString('hex')
  return {
    ...process.env,
    COMPOSE_PROJECT_NAME: 'sgo-e2e',
    POSTGRES_USER: 'sgo',
    POSTGRES_PASSWORD: process.env['E2E_DB_PASSWORD'],
    POSTGRES_DB: 'sgo',
    POSTGRES_PORT: '55432',
    HTTP_PORT: '8080',
    HTTPS_PORT: '8443',
    SITE_ADDRESS: 'localhost',
    PUBLIC_ORIGIN: E2E_ORIGIN,
  }
}

export function compose(...args: string[]): string {
  return execFileSync('docker', ['compose', ...args], {
    cwd: repoRoot,
    env: composeEnv(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
}

export function readSetupToken(): string {
  const logs = compose('logs', '--no-color', 'backend')
  const match = /"codigo":"([^"]+)"/.exec(logs)
  if (!match?.[1]) throw new Error('no se encontro el codigo de instalacion en el log del backend')
  return match[1]
}
