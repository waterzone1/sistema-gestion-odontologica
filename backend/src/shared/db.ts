import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

export function createDb(connectionString: string) {
  const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 3000 })
  return new PrismaClient({ adapter, transactionOptions: { maxWait: 10_000, timeout: 15_000 } })
}

export type Db = ReturnType<typeof createDb>
