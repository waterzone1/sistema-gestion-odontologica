import { createReadStream } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'

export interface FileStorageConfig {
  dir: string
  maxBytes: number
}

const KEY = /^\d{4}\/\d{2}\/[0-9a-f-]{36}$/

function resolveKey(config: FileStorageConfig, key: string): string {
  if (!KEY.test(key)) throw new Error(`clave de archivo invalida: ${key}`)
  return path.join(config.dir, ...key.split('/'))
}

export function storageKeyFor(id: string, date: Date): string {
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${id}`
}

export async function storeFile(config: FileStorageConfig, key: string, content: Buffer): Promise<void> {
  const target = resolveKey(config, key)
  await mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.partial`
  await writeFile(temporary, content, { flag: 'wx' })
  await rename(temporary, target)
}

export async function discardFile(config: FileStorageConfig, key: string): Promise<void> {
  await rm(resolveKey(config, key), { force: true })
}

export function openFile(config: FileStorageConfig, key: string): Readable {
  return createReadStream(resolveKey(config, key))
}
