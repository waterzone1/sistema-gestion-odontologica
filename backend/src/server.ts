import path from 'node:path'
import { createApp } from './app.js'
import { loadEnv } from './config/env.js'
import type { Env } from './config/env.js'
import { needsSetup } from './modules/organizations/setup.service.js'
import { createSetupTokenStore } from './modules/organizations/setupToken.js'
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
const setupTokens = createSetupTokenStore()

const app = createApp({
  db,
  logger,
  setupTokens,
  appOrigin: env.APP_ORIGIN,
  cookieSecure: env.NODE_ENV === 'production',
  files: { dir: path.resolve(env.FILES_DIR), maxBytes: env.FILE_MAX_MB * 1024 * 1024 },
})

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'servidor escuchando')
})

needsSetup(db)
  .then((pending) => {
    if (pending) {
      logger.warn(
        { codigo: setupTokens.issue() },
        'instalacion sin configurar: usar este codigo en el asistente de configuracion inicial',
      )
    }
  })
  .catch((err: unknown) => {
    logger.error({ err }, 'no se pudo comprobar si la instalacion esta configurada')
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
