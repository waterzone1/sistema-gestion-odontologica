import { createApp } from './app.js'
import { loadEnv } from './config/env.js'
import type { Env } from './config/env.js'
import { createDb } from './shared/db.js'
import { createLogger } from './shared/logger.js'

let env: Env
try {
  env = loadEnv()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}

const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' })
const db = createDb(env.DATABASE_URL)
const app = createApp({ db, logger })

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'servidor escuchando')
})

function shutdown(signal: string): void {
  logger.info({ signal }, 'cerrando servidor')
  const forzar = setTimeout(() => process.exit(1), 10_000)
  forzar.unref()
  server.close(() => {
    void db.$disconnect().finally(() => process.exit(0))
  })
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM')
})
process.on('SIGINT', () => {
  shutdown('SIGINT')
})
