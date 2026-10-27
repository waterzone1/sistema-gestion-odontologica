import { randomBytes } from 'node:crypto'
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Db } from '../../shared/db.js'
import { AppError } from '../../shared/errors.js'
import type { Logger } from '../../shared/logger.js'
import { recordAudit, type AuditEntry } from '../audit/audit.service.js'
import { localDay } from '../billing/domain/balance.js'
import {
  dumpDatabase,
  fileDigest,
  packDirectory,
  pgToolsAvailable,
  restoreDatabase,
  unpack,
  type BackupConfig,
} from './backups.archive.js'
import { backupRecordSchema, type BackupCounts, type BackupRecord, type BackupStatusDto, type RestoreResultDto } from './backups.schemas.js'
import { backupsToDelete } from './domain/retention.js'

interface Manifest {
  id: string
  kind: BackupRecord['kind']
  createdAt: string
  schemaVersion: string
  counts: BackupCounts
  files: Record<'database.dump' | 'files.tar', { size: number; sha256: string }>
}

interface Actor {
  userId: string | null
  displayName: string | null
}

const state = { maintenance: false, running: null as string | null, nextScheduled: null as string | null }

export const maintenanceActive = () => state.maintenance

export function setNextScheduled(value: Date | null) {
  state.nextScheduled = value ? value.toISOString() : null
}

const recordFile = (config: BackupConfig, id: string) => path.join(config.dir, `${id}.json`)
const archiveFile = (config: BackupConfig, id: string) => path.join(config.dir, `${id}.tar`)

function newId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  return `backup-${stamp}-${randomBytes(3).toString('hex')}`
}

async function writeRecord(config: BackupConfig, record: BackupRecord) {
  await writeFile(recordFile(config, record.id), JSON.stringify(record, null, 2))
}

async function readRecord(config: BackupConfig, id: string): Promise<BackupRecord | null> {
  try {
    const parsed = backupRecordSchema.safeParse(JSON.parse(await readFile(recordFile(config, id), 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function listBackups(config: BackupConfig): Promise<BackupRecord[]> {
  await mkdir(config.dir, { recursive: true })
  const names = (await readdir(config.dir)).filter((name) => /^backup-.*\.json$/.test(name))
  const records = await Promise.all(names.map((name) => readRecord(config, name.replace(/\.json$/, ''))))
  return records
    .filter((record): record is BackupRecord => record !== null)
    .map((record) =>
      record.status === 'RUNNING' && record.id !== state.running
        ? { ...record, status: 'FAILED' as const, error: record.error ?? 'Se interrumpió antes de terminar' }
        : record,
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

async function databaseCounts(db: Db): Promise<BackupCounts> {
  const [patients, appointments, clinicalEntries, services, payments, clinicalFiles] = await Promise.all([
    db.patient.count(),
    db.appointment.count(),
    db.clinicalEntry.count(),
    db.performedService.count(),
    db.payment.count(),
    db.clinicalFile.count(),
  ])
  return { patients, appointments, clinicalEntries, services, payments, clinicalFiles }
}

async function schemaVersion(db: Db): Promise<string> {
  const rows = await db.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1`
  return rows[0]?.migration_name ?? ''
}

interface Context {
  organizationId: string | null
  timeZone: string
}

async function contextOf(db: Db): Promise<Context> {
  const organization = await db.organization.findFirst({ select: { id: true, timezone: true } })
  return { organizationId: organization?.id ?? null, timeZone: organization?.timezone ?? 'UTC' }
}

function audit(db: Db, context: Context, actor: Actor, entry: Pick<AuditEntry, 'action' | 'entityId' | 'metadata'>) {
  return recordAudit(db, { ...entry, entityType: 'Backup', organizationId: context.organizationId, actorUserId: actor.userId })
}

function assertIdle() {
  if (state.running || state.maintenance) throw new AppError(409, 'BACKUP_BUSY', 'Ya hay un backup o una restauración en curso')
}

async function succeededOrFail(config: BackupConfig, id: string) {
  const record = await readRecord(config, id)
  const file = archiveFile(config, id)
  const exists = await stat(file).then(
    () => true,
    () => false,
  )
  if (record?.status !== 'SUCCEEDED' || !record.sha256 || !record.counts || !exists) {
    throw new AppError(404, 'NOT_FOUND', 'El backup no existe o no terminó bien')
  }
  return { record: { ...record, sha256: record.sha256, counts: record.counts }, file }
}

async function applyRetention(config: BackupConfig, logger: Logger, context: Context) {
  const doomed = backupsToDelete(await listBackups(config), (iso) => localDay(new Date(iso), context.timeZone))
  for (const id of doomed) {
    await rm(archiveFile(config, id), { force: true })
    await rm(recordFile(config, id), { force: true })
  }
  if (doomed.length > 0) logger.info({ borrados: doomed.length }, 'retencion de backups aplicada')
}

async function runBackup(db: Db, config: BackupConfig, logger: Logger, context: Context, actor: Actor, record: BackupRecord): Promise<BackupRecord> {
  const work = path.join(config.dir, `.${record.id}`)
  try {
    await mkdir(work, { recursive: true })
    await mkdir(config.filesDir, { recursive: true })
    await dumpDatabase(config, path.join(work, 'database.dump'))
    await packDirectory(config.filesDir, path.join(work, 'files.tar'))
    const manifest: Manifest = {
      id: record.id,
      kind: record.kind,
      createdAt: record.startedAt,
      schemaVersion: await schemaVersion(db),
      counts: await databaseCounts(db),
      files: {
        'database.dump': await fileDigest(path.join(work, 'database.dump')),
        'files.tar': await fileDigest(path.join(work, 'files.tar')),
      },
    }
    await writeFile(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2))
    await packDirectory(work, archiveFile(config, record.id), ['manifest.json', 'database.dump', 'files.tar'])
    const digest = await fileDigest(archiveFile(config, record.id))
    const done: BackupRecord = {
      ...record,
      status: 'SUCCEEDED',
      finishedAt: new Date().toISOString(),
      size: digest.size,
      sha256: digest.sha256,
      schemaVersion: manifest.schemaVersion,
      counts: manifest.counts,
    }
    await writeRecord(config, done)
    await audit(db, context, actor, { action: 'BACKUP_COMPLETED', entityId: record.id, metadata: { tipo: record.kind, bytes: digest.size } })
    if (record.kind === 'SCHEDULED') await applyRetention(config, logger, context)
    return done
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ err, backup: record.id }, 'fallo el backup')
    await rm(archiveFile(config, record.id), { force: true })
    const failed: BackupRecord = { ...record, status: 'FAILED', finishedAt: new Date().toISOString(), error: message.slice(0, 500) }
    await writeRecord(config, failed)
    await audit(db, context, actor, { action: 'BACKUP_FAILED', entityId: record.id, metadata: { tipo: record.kind } }).catch(() => undefined)
    return failed
  } finally {
    await rm(work, { recursive: true, force: true })
    state.running = null
  }
}

export async function startBackup(
  db: Db,
  config: BackupConfig,
  logger: Logger,
  actor: Actor,
  kind: BackupRecord['kind'],
): Promise<{ record: BackupRecord; done: Promise<BackupRecord> }> {
  assertIdle()
  await mkdir(config.dir, { recursive: true })
  const context = await contextOf(db)
  const now = new Date()
  const record: BackupRecord = {
    id: newId(now),
    kind,
    status: 'RUNNING',
    startedAt: now.toISOString(),
    finishedAt: null,
    size: null,
    sha256: null,
    schemaVersion: null,
    counts: null,
    createdBy: actor.displayName,
    error: null,
  }
  state.running = record.id
  try {
    await writeRecord(config, record)
    await audit(db, context, actor, { action: 'BACKUP_STARTED', entityId: record.id, metadata: { tipo: kind } })
  } catch (err) {
    state.running = null
    throw err
  }
  return { record, done: runBackup(db, config, logger, context, actor, record) }
}

let tools: Promise<boolean> | null = null
const toolsAvailable = (config: BackupConfig) => (tools ??= pgToolsAvailable(config))

export async function backupStatus(config: BackupConfig): Promise<BackupStatusDto> {
  const backups = await listBackups(config)
  return {
    maintenance: state.maintenance,
    running: state.running,
    lastSuccess: backups.find((b) => b.status === 'SUCCEEDED')?.finishedAt ?? null,
    nextScheduled: state.nextScheduled,
    toolsAvailable: await toolsAvailable(config),
  }
}

export async function backupArchive(config: BackupConfig, id: string): Promise<string> {
  return (await succeededOrFail(config, id)).file
}

async function replaceFiles(source: string, target: string) {
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(target)) await rm(path.join(target, entry), { recursive: true, force: true })
  await cp(source, target, { recursive: true })
}

export async function restoreBackup(
  db: Db,
  config: BackupConfig,
  logger: Logger,
  actor: Actor & { sessionId: string },
  id: string,
): Promise<RestoreResultDto> {
  assertIdle()
  const { record, file: archive } = await succeededOrFail(config, id)
  const context = await contextOf(db)
  const digest = await fileDigest(archive).catch(() => null)
  if (digest?.sha256 !== record.sha256) throw new AppError(422, 'BACKUP_CORRUPT', 'El archivo del backup está dañado o no coincide con su registro')
  if (record.schemaVersion !== (await schemaVersion(db))) {
    throw new AppError(422, 'SCHEMA_MISMATCH', 'El backup es de otra versión del sistema y no se puede restaurar en esta')
  }

  const work = path.join(config.dir, `.restore-${id}`)
  state.running = id
  try {
    await rm(work, { recursive: true, force: true })
    await mkdir(path.join(work, 'files'), { recursive: true })
    await unpack(archive, work)
    const manifest = JSON.parse(await readFile(path.join(work, 'manifest.json'), 'utf8')) as Manifest
    for (const name of ['database.dump', 'files.tar'] as const) {
      if ((await fileDigest(path.join(work, name))).sha256 !== manifest.files[name].sha256) {
        throw new AppError(422, 'BACKUP_CORRUPT', `El contenido del backup está dañado (${name})`)
      }
    }
    await unpack(path.join(work, 'files.tar'), path.join(work, 'files'))
    const session = await db.session.findUnique({ where: { id: actor.sessionId } })

    state.maintenance = true
    logger.warn({ backup: id }, 'restauracion iniciada: sistema en mantenimiento')
    await restoreDatabase(config, path.join(work, 'database.dump'))
    await replaceFiles(path.join(work, 'files'), config.filesDir)

    const counts = await databaseCounts(db)
    if (JSON.stringify(counts) !== JSON.stringify(manifest.counts)) {
      throw new AppError(500, 'RESTORE_VERIFICATION_FAILED', 'La restauración terminó pero los datos no coinciden con el backup', {
        esperado: manifest.counts,
        obtenido: counts,
      })
    }
    if (session && (await db.user.findUnique({ where: { id: session.userId } }))) {
      await db.session.upsert({ where: { id: session.id }, create: session, update: {} })
    }
    const restoredAt = new Date().toISOString()
    await audit(db, context, actor, { action: 'BACKUP_RESTORED', entityId: id, metadata: { backup: id } })
    logger.warn({ backup: id }, 'restauracion terminada')
    return { id, restoredAt, counts }
  } catch (err) {
    if (err instanceof AppError) throw err
    logger.error({ err, backup: id }, 'fallo la restauracion')
    const message = err instanceof Error ? err.message : String(err)
    throw new AppError(500, 'RESTORE_FAILED', `La restauración falló: ${message.slice(0, 400)}`)
  } finally {
    state.maintenance = false
    state.running = null
    await rm(work, { recursive: true, force: true })
  }
}
