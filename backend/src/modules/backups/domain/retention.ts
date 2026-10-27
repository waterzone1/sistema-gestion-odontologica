export interface RetainedBackup {
  id: string
  kind: 'SCHEDULED' | 'MANUAL'
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  startedAt: string
}

export interface RetentionPolicy {
  daily: number
  weekly: number
  manual: number
}

const DEFAULT_RETENTION: RetentionPolicy = { daily: 7, weekly: 4, manual: 10 }

function weekKey(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  const weekday = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - weekday)
  return date.toISOString().slice(0, 10)
}

export function backupsToDelete(
  backups: readonly RetainedBackup[],
  dayOf: (iso: string) => string,
  policy: RetentionPolicy = DEFAULT_RETENTION,
): string[] {
  const newestFirst = [...backups].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const keep = new Set<string>()

  const scheduled = newestFirst.filter((b) => b.kind === 'SCHEDULED' && b.status === 'SUCCEEDED')
  const days = new Set<string>()
  const weeks = new Set<string>()
  for (const backup of scheduled) {
    const day = dayOf(backup.startedAt)
    if (!days.has(day) && days.size < policy.daily) {
      days.add(day)
      keep.add(backup.id)
    }
    const week = weekKey(day)
    if (!weeks.has(week) && weeks.size < policy.weekly) {
      weeks.add(week)
      keep.add(backup.id)
    }
  }

  newestFirst
    .filter((b) => b.kind === 'MANUAL' && b.status === 'SUCCEEDED')
    .slice(0, policy.manual)
    .forEach((b) => keep.add(b.id))

  const failed = newestFirst.filter((b) => b.status === 'FAILED')
  failed.slice(0, policy.daily).forEach((b) => keep.add(b.id))

  return newestFirst.filter((b) => b.status !== 'RUNNING' && !keep.has(b.id)).map((b) => b.id)
}
