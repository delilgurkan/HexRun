// Playwright config: serves dist/ with scripts/serve.mjs and runs the e2e/a11y suite in Chromium.
// Uses a pre-installed browser if present (PLAYWRIGHT_BROWSERS_PATH, default /opt/pw-browsers);
// otherwise run `npx playwright install chromium` once.
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
}
const PORT = Number(process.env.WEB_TEST_PORT || 4173);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node scripts/serve.mjs --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
