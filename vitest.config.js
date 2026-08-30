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
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Only the pure-logic modules are held to a coverage bar. Three files
      // are deliberately left OFF this list — not because they are untested,
      // but because they are already exercised end-to-end by the Playwright
      // suite in e2e/, and forcing them into a vitest coverage report would
      // be either impossible or actively harmful:
      //   - ui.js           DOM wiring/rendering — hitting 100% here means
      //                     mocking the thing under test.
      //   - webmcp.js       calls the real browser `document.modelContext`
      //                     API, which does not exist in a vitest worker.
      //   - declarative.js  every exported function (`syncDeclarative`,
      //                     `wireDeclarative`) reaches for `document` in its
      //                     first line — there is no branch of meaningful
      //                     size in this file that decides anything without
      //                     touching the DOM. (The one candidate, the
      //                     legal/illegal toggle in `syncDeclarative`, is a
      //                     single-line call straight into `rule()`, which
      //                     `rule.js` already covers at 100% on its own.)
      //                     No jsdom/happy-dom dependency was added to chase
      //                     this file, per the zero-new-runtime/no-scope-
      //                     creep instruction — it stays covered by e2e only.
      include: [
        'src/rule.js',
        'src/fsm.js',
        'src/effects.js',
        'src/path.js',
        'src/minutes.js',
        'src/ronr.data.js',
        'src/seed.js'
      ],
      thresholds: {
        'src/rule.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/fsm.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/effects.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/path.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/minutes.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/ronr.data.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/seed.js': { statements: 100, branches: 100, functions: 100, lines: 100 }
      }
    }
  }
});
