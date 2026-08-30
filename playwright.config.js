/**
 * playwright.config.js — E2E against the real page, served as static files.
 *
 * There is no build step, so there is nothing to build: the webServer below is a
 * plain static file server pointed at the repo root, which is exactly what Netlify
 * does in production. `index.html` and `src/*.js` are the artifacts under test, not
 * a bundle produced from them.
 *
 * NOTE ON CI: the WebMCP origin trial is bound to https://pointoforder.netlify.app,
 * so on a runner `document.modelContext` is absent and the bench renders from its
 * own state machine instead (the banner says so). The panel counts are identical in
 * both modes by design — see src/ui.js renderInOrder() — which is why every
 * assertion in e2e/ is written against those counts and never against the presence
 * of the WebMCP API.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],

  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],

  webServer: {
    // python3 is preinstalled on ubuntu-latest and on macOS; adding a node static
    // server would put a dependency in a tree that advertises having none.
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `${BASE}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
