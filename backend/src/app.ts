import express from 'express'
import type { Express } from 'express'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'
import { errorHandler } from './middleware/errorHandler.js'
import { httpLogger } from './middleware/httpLogger.js'
import { notFound } from './middleware/notFound.js'
import { healthRouter } from './modules/health/health.routes.js'
import { buildOpenApiDocument } from './openapi/document.js'
import type { Db } from './shared/db.js'
import type { Logger } from './shared/logger.js'

interface AppDeps {
  db: Db
  logger: Logger
}

export function createApp({ db, logger }: AppDeps): Express {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use(httpLogger(logger))

  const openApiDocument = buildOpenApiDocument()
  // swagger ui necesita scripts inline, por eso va antes con la csp apagada
  app.use(
    '/api/docs',
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument as swaggerUi.JsonObject),
  )

  app.use(helmet())
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiDocument)
  })
  app.use('/api/health', healthRouter(db))

  app.use(notFound)
  app.use(errorHandler)
  return app
}
