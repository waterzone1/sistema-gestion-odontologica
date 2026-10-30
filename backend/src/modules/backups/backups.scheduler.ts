import type { Db } from '../../shared/db.js'
import type { Logger } from '../../shared/logger.js'
import { backupSlots, readSettings } from '../organizations/domain/settings.js'
import type { BackupConfig } from './backups.archive.js'
import { listBackups, markSchedulerActive, startBackup } from './backups.service.js'

const CHECK_EVERY_MS = 5 * 60_000

export function startBackupScheduler(db: Db, config: BackupConfig, logger: Logger): () => void {
  const check = async () => {
    const organization = await db.organization.findFirst({ select: { timezone: true, settings: true } })
    if (!organization) return
    const { latest } = backupSlots(readSettings(organization.settings).backups, new Date(), organization.timezone)
    if (!latest) return
    const covered = (await listBackups(config)).some(
      (b) => b.kind === 'SCHEDULED' && b.status !== 'FAILED' && new Date(b.startedAt).getTime() >= latest.getTime(),
    )
    if (covered) return
    const { done } = await startBackup(db, config, logger, { userId: null, displayName: 'Backup automático' }, 'SCHEDULED')
    await done
  }
  const tick = () => {
    check().catch((err: unknown) => logger.error({ err }, 'no se pudo revisar el backup programado'))
  }
  markSchedulerActive()
  const first = setTimeout(tick, 60_000)
  const timer = setInterval(tick, CHECK_EVERY_MS)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
