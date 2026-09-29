import type { Request, Response } from 'express'
import { authOf } from '../../middleware/access.js'
import type { Db } from '../../shared/db.js'
import {
  createUserSchema,
  idParamsSchema,
  resetPasswordSchema,
  updateUserSchema,
} from './users.schemas.js'
import * as usersService from './users.service.js'

export function usersController(db: Db) {
  return {
    list: async (req: Request, res: Response): Promise<void> => {
      res.json(await usersService.listUsers(db, authOf(req)))
    },

    get: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params)
      res.json(await usersService.getUser(db, authOf(req), id))
    },

    create: async (req: Request, res: Response): Promise<void> => {
      const input = createUserSchema.parse(req.body)
      res.status(201).json(await usersService.createUser(db, authOf(req), input))
    },

    update: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params)
      const input = updateUserSchema.parse(req.body)
      res.json(await usersService.updateUser(db, authOf(req), id, input))
    },

    resetPassword: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params)
      const { password } = resetPasswordSchema.parse(req.body)
      await usersService.resetPassword(db, authOf(req), id, password)
      res.status(204).end()
    },

    deactivate: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params)
      res.json(await usersService.deactivateUser(db, authOf(req), id))
    },

    activate: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params)
      res.json(await usersService.activateUser(db, authOf(req), id))
    },

    revokeSessions: async (req: Request, res: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(req.params)
      const revoked = await usersService.revokeSessionsOf(db, authOf(req), id)
      res.json({ revokedSessions: revoked })
    },
  }
}
