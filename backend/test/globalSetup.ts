import { execFileSync } from 'node:child_process'
import pg from 'pg'

export default async function setup(): Promise<void> {
  const baseUrl = process.env['DATABASE_URL']
  if (!baseUrl) throw new Error('los tests de integracion necesitan DATABASE_URL')

  const url = new URL(baseUrl)
  const testDb = `${url.pathname.slice(1)}_test`
  if (!/^[a-z0-9_]+$/.test(testDb)) throw new Error(`nombre de base de tests invalido: ${testDb}`)

  const admin = new pg.Client({ connectionString: baseUrl })
  await admin.connect()
  try {
    const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDb])
    if (existe.rowCount === 0) await admin.query(`CREATE DATABASE "${testDb}"`)
  } finally {
    await admin.end()
  }

  url.pathname = `/${testDb}`
  const testUrl = url.toString()
  process.env['TEST_DATABASE_URL'] = testUrl

  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  })
}
