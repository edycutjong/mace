/**
 * vitest.config.js — keeps the two suites out of each other's way.
 *
 * vitest's default `include` is `**\/*.{test,spec}.js`, which swallows the
 * Playwright specs in e2e/ and then dies importing @playwright/test into a vitest
 * worker. Naming the unit suite explicitly is the fix: test/ is vitest's, e2e/ is
 * Playwright's, and neither pattern can drift into the other's directory.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js']
  }
});
