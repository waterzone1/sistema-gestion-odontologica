import cookieParser from 'cookie-parser'
import express from 'express'
import type { Express } from 'express'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'
import { publicRoute } from './middleware/access.js'
import { csrfProtection } from './middleware/csrf.js'
import { errorHandler } from './middleware/errorHandler.js'
import { httpLogger } from './middleware/httpLogger.js'
import { notFound } from './middleware/notFound.js'
import { DEFAULT_LOGIN_RATE_LIMIT, type LoginRateLimit } from './middleware/rateLimit.js'
import { sessionMiddleware } from './middleware/session.js'
import { appointmentsRouter } from './modules/appointments/appointments.routes.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { branchesRouter } from './modules/branches/branches.routes.js'
import { healthRouter } from './modules/health/health.routes.js'
import { patientsRouter } from './modules/patients/patients.routes.js'
import { setupRouter } from './modules/organizations/setup.routes.js'
import type { SetupTokenStore } from './modules/organizations/setupToken.js'
import { practicesRouter } from './modules/practices/practices.routes.js'
import { professionalsRouter } from './modules/professionals/professionals.routes.js'
import { usersRouter } from './modules/users/users.routes.js'
import { buildOpenApiDocument } from './openapi/document.js'
import type { Db } from './shared/db.js'
import type { Logger } from './shared/logger.js'

export interface AppDeps {
  db: Db
  logger: Logger
  setupTokens: SetupTokenStore
  appOrigin: string
  cookieSecure: boolean
  loginRateLimit?: LoginRateLimit
}

export function createApp({
  db,
  logger,
  setupTokens,
  appOrigin,
  cookieSecure,
  loginRateLimit = DEFAULT_LOGIN_RATE_LIMIT,
}: AppDeps): Express {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use(httpLogger(logger))

  const openApiDocument = buildOpenApiDocument()
  app.use(
    '/api/docs',
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument as swaggerUi.JsonObject),
  )

  app.use(helmet())
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.use(sessionMiddleware(db))
  app.use(csrfProtection(appOrigin))

  app.get('/api/openapi.json', publicRoute(), (_req, res) => {
    res.json(openApiDocument)
  })
  app.use('/api/health', healthRouter(db))
  app.use('/api/setup', setupRouter({ db, tokens: setupTokens, cookieSecure }))
  app.use('/api/auth', authRouter({ db, cookieSecure, loginRateLimit }))
  app.use('/api/users', usersRouter(db))
  app.use('/api/branches', branchesRouter(db))
  app.use('/api/professionals', professionalsRouter(db))
  app.use('/api/patients', patientsRouter(db))
  app.use('/api/practices', practicesRouter(db))
  app.use('/api/appointments', appointmentsRouter(db))

  app.use(notFound)
  app.use(errorHandler)
  return app
}
