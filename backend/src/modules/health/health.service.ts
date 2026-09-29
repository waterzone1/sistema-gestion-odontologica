import type { Db } from '../../shared/db.js'
import type { HealthResponse } from './health.schemas.js'

const DB_TIMEOUT_MS = 2000

async function pingDb(db: Db): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error('timeout consultando la base'))
    }, DB_TIMEOUT_MS)
  })
  try {
    await Promise.race([db.$queryRaw`SELECT 1`, timeout])
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function checkHealth(db: Db): Promise<HealthResponse> {
  const dbUp = await pingDb(db)
  return {
    status: dbUp ? 'ok' : 'degraded',
    db: dbUp ? 'up' : 'down',
    uptimeSeconds: Math.floor(process.uptime()),
  }
}
