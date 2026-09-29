import { defineConfig, devices } from '@playwright/test'

// los e2e levantan su propio stack de docker compose (ver e2e/stack.ts), aislado del de desarrollo
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
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
