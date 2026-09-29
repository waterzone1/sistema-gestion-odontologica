import { compose } from './stack'

export default function globalTeardown(): void {
  if (process.env['E2E_KEEP_STACK']) return
  compose('down', '-v', '--remove-orphans')
}
