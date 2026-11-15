import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: `${process.env.SREZ_GO_COMMAND || 'go'} test ./internal/server -run '^TestExclusionsBrowserServer$' -count=1 -timeout=10m -v`,
      cwd: '../api',
      env: {
        TEST_DATABASE_URL: '', DATABASE_URL: '', RUNNER_URL: 'http://127.0.0.1:1',
        SREZ_E2E_ADDR: '127.0.0.1:18081', GOTOOLCHAIN: 'local',
        GOCACHE: process.env.GOCACHE || '/private/tmp/srez-excluded-words-gocache',
        GOTMPDIR: process.env.GOTMPDIR || '/private/tmp/srez-excluded-words-go-tmp',
        GOMODCACHE: process.env.GOMODCACHE || '/private/tmp/srez-excluded-words-gomodcache',
      },
      url: 'http://127.0.0.1:18081/__test/state',
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --port 5174 --strictPort',
      env: { TEST_DATABASE_URL: '', DATABASE_URL: '', RUNNER_URL: 'http://127.0.0.1:1', SREZ_E2E_API_ORIGIN: 'http://127.0.0.1:18081' },
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
    },
  ],
});
