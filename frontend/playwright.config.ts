import { defineConfig, devices } from '@playwright/test'

const TIME_ZONE = 'America/Argentina/Buenos_Aires'
process.env['TZ'] = TIME_ZONE

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  outputDir: './test-results',
  use: {
    baseURL: 'https://localhost:8443',
    ignoreHTTPSErrors: true,
    locale: 'es-AR',
    timezoneId: TIME_ZONE,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
