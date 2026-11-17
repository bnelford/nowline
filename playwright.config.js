import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// GitHub Pages serves this repo at https://bnelford.github.io/nowline/. The "subpath" project runs the
// same tests against only the staged site files (scripts/site.js) served under /nowline/, so an absolute
// path or a file missing from the Pages artifact shows up as a failure.
const SUB_PORT = 4174, SUB_BASE = '/nowline/';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    timezoneId: 'America/Los_Angeles',
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT}/` } },
    { name: 'subpath', use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${SUB_PORT}${SUB_BASE}` } },
  ],
  webServer: [
    {
      command: `node scripts/serve.js ${PORT}`,
      url: `http://localhost:${PORT}/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `node scripts/site.js _site && node scripts/serve.js ${SUB_PORT} --root _site --base ${SUB_BASE}`,
      url: `http://localhost:${SUB_PORT}${SUB_BASE}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
