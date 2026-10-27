import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

export interface BackupConfig {
  dir: string
  filesDir: string
  databaseUrl: string
  pgBinDir?: string | undefined
}

function pgEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl)
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.replace(/^\//, ''),
  }
}

function binary(config: BackupConfig, name: string): string {
  return config.pgBinDir ? `${config.pgBinDir.replace(/[\\/]$/, '')}/${name}` : name
}

function run(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-2000)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`${command} termino con codigo ${String(code)}: ${stderr.trim()}`))
    })
  })
}

export async function dumpDatabase(config: BackupConfig, target: string): Promise<void> {
  await run(binary(config, 'pg_dump'), ['--format=custom', '--no-owner', '--no-privileges', `--file=${target}`], pgEnv(config.databaseUrl))
}

export async function restoreDatabase(config: BackupConfig, source: string): Promise<void> {
  await run(
    binary(config, 'pg_restore'),
    ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', `--dbname=${pgEnv(config.databaseUrl).PGDATABASE ?? ''}`, source],
    pgEnv(config.databaseUrl),
  )
}

export async function pgToolsMajor(config: BackupConfig): Promise<number | null> {
  try {
    const version = /(\d+)(?:\.\d+)*/.exec(await run(binary(config, 'pg_dump'), ['--version']))
    return version ? Number(version[1]) : null
  } catch {
    return null
  }
}

export async function pgToolsAvailable(config: BackupConfig): Promise<boolean> {
  return (await pgToolsMajor(config)) !== null
}

export async function packDirectory(source: string, target: string, entries: string[] = ['.']): Promise<void> {
  await run('tar', ['-cf', target, '-C', source, ...entries])
}

export async function unpack(archive: string, targetDir: string): Promise<void> {
  await run('tar', ['-xf', archive, '-C', targetDir])
}

export async function fileDigest(file: string): Promise<{ size: number; sha256: string }> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve())
      .on('error', reject)
  })
  return { size: (await stat(file)).size, sha256: hash.digest('hex') }
}
