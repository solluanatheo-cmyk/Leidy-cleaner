import { defineConfig, devices } from '@playwright/test';
import path from 'path';

// __dirname isn't defined in ES module scope, replicate it using import.meta.url
const rootDir = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
  testDir: './tests',
  timeout: 60_000, // give a bit more headroom for slow machines
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // set a higher default nav timeout, individual tests can override
    navigationTimeout: 60000
  },

  webServer: {
    // clean any leftover dev server and Next cache before starting; this
    // prevents the lockfile/port conflicts that were causing Playwright to
    // launch a broken server and hang tests.
    // do *not* reuse an existing server because a previous dev instance may
    // be running in the wrong NODE_ENV (development) and would incorrectly
    // answer requests during E2E.
    command: "npm run clean:next && npm run dev",
    cwd: rootDir,
    port: 3000,
    reuseExistingServer: false,
    timeout: 120_000
  },
  globalSetup: path.resolve(rootDir, './tests/global-setup.ts'),
  globalTeardown: path.resolve(rootDir, './tests/global-teardown.ts'),
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
