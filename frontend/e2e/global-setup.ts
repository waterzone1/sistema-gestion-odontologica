import { compose, readSetupToken } from './stack'

export default function globalSetup(): void {
  compose('down', '-v', '--remove-orphans')
  compose('up', '-d', '--build', '--wait')
  process.env['E2E_SETUP_TOKEN'] = readSetupToken()
}
