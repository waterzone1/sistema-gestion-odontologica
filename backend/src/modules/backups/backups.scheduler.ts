import type { Db } from '../../shared/db.js'
import type { Logger } from '../../shared/logger.js'
import { organizationTimeZone } from '../availability/availability.service.js'
import { addDays, fromLocal, toLocal } from '../availability/domain/availability.js'
import { localDay } from '../billing/domain/balance.js'
import type { BackupConfig } from './backups.archive.js'
import { listBackups, setNextScheduled, startBackup } from './backups.service.js'

const CHECK_EVERY_MS = 10 * 60_000

export function startBackupScheduler(db: Db, config: BackupConfig, logger: Logger, hour: number): () => void {
  const check = async () => {
    const organization = await db.organization.findFirst({ select: { id: true } })
    if (!organization) return
    const timeZone = await organizationTimeZone(db, organization.id)
    const now = new Date()
    const today = localDay(now, timeZone)
    const tomorrow = fromLocal(addDays(today, 1), hour * 60, timeZone)
    if (toLocal(now, timeZone).minute < hour * 60) {
      setNextScheduled(fromLocal(today, hour * 60, timeZone))
      return
    }
    const doneToday = (await listBackups(config)).some(
      (b) => b.kind === 'SCHEDULED' && b.status !== 'FAILED' && localDay(new Date(b.startedAt), timeZone) === today,
    )
    setNextScheduled(tomorrow)
    if (doneToday) return
    const { done } = await startBackup(db, config, logger, { userId: null, displayName: 'Backup automático' }, 'SCHEDULED')
    await done
  }
  const tick = () => {
    check().catch((err: unknown) => logger.error({ err }, 'no se pudo revisar el backup programado'))
  }
  const first = setTimeout(tick, 60_000)
  const timer = setInterval(tick, CHECK_EVERY_MS)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
