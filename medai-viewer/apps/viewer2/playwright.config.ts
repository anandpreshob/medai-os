import { defineConfig, devices } from '@playwright/test';

/**
 * E2E for the Tier 1 viewer. Two projects:
 *  - `no-backend`: the viewer with no PACS (VITE_DICOMWEB_URL points at a dead port).
 *  - `pacs`: requires a reachable Orthanc at ORTHANC_URL (default http://localhost:8042);
 *    specs skip themselves when it is not reachable.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/report.json' }]]
    : [['list'], ['json', { outputFile: 'test-results/report.json' }]],
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1400, height: 900 },
  },
  // Locally: drive the installed Google Chrome (no browser download). CI: Playwright's pinned Chromium.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' } }],
  webServer: {
    command: 'pnpm exec vite --port 3100 --strictPort',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
