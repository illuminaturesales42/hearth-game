import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke-level end-to-end tests: boot the *production* build in a real browser
 * and prove the app renders and that a saved day survives a reload (the
 * zero-save-loss gate). Runs in CI on every push/PR to guard the deploy
 * pipeline — a green unit suite can't catch a build that boots to a blank page.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Test the real bundle, not the dev server.
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
