import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

export function createDb(connectionString: string) {
  const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 3000 })
  return new PrismaClient({ adapter })
}

export type Db = ReturnType<typeof createDb>
