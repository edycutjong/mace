/**
 * eslint.config.js — flat config, ESLint 9.
 *
 * mace has no bundler and no build step: the browser loads src/*.js verbatim as ES
 * modules. That removes the one thing that normally catches a typo'd identifier
 * before a judge does, so this config exists for `no-undef` above all else — the
 * rest is the recommended correctness set plus three rules that can fail a program.
 *
 * It is deliberately NOT a formatter. No Prettier, no stylistic rules, no reflow of
 * a submitted file. `prefer-const`, brace style, quotes and semicolons are all
 * absent on purpose: none of them can break this app, and churning a shipped file
 * to satisfy them is a worse trade than leaving it alone.
 */

import js from '@eslint/js';

/**
 * The browser surface src/ actually touches, written out rather than pulled from
 * the `globals` package — a lint config should not add a dependency to a repo whose
 * README badges `runtime_deps 0`, and the list is fourteen names long.
 */
const browserGlobals = {
  document: 'readonly',
  window: 'readonly',
  navigator: 'readonly',
  globalThis: 'readonly',
  console: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  DOMException: 'readonly',
  FormData: 'readonly',
  CustomEvent: 'readonly',
  EventTarget: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  queueMicrotask: 'readonly'
};

const correctness = {
  // The whole reason this config exists: an unbundled module ships its typos.
  'no-undef': 'error',

  // vars only. Parameters are unchecked because without types the codebase is full
  // of honest fixed-arity callbacks — `use.map(line)`, `execute(input, options)` —
  // whose unused tail argument is a signature, not a defect.
  'no-unused-vars': ['error', {
    args: 'none',
    caughtErrors: 'none',
    ignoreRestSiblings: true,   // `const { enumFromTable, ...rest } = p` omits a key
    varsIgnorePattern: '^_'
  }],

  // `!= null` is a deliberate idiom in ui.js (null AND undefined); everything else
  // must be strict, because == between a string form value and a number is a bug.
  eqeqeq: ['error', 'always', { null: 'ignore' }],

  'no-var': 'error',

  // Throwing a bare string loses the stack and breaks `err.message` handling —
  // ui.js's runner dialog reads exactly that field.
  'no-throw-literal': 'error'
};

export default [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'dist/**',
      '.netlify/**',
      'playwright-report/**',
      'test-results/**',
      'site/**' // published copy of the pitch surface — not this app's source
    ]
  },

  js.configs.recommended,

  // ── the app: browser ES modules, loaded straight from disk ────────────────
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: browserGlobals
    },
    rules: correctness
  },

  /**
   * Two dead identifiers in files that are frozen for judging: the unused
   * `contextSource` import in ui.js (the value is read off `start()`'s return
   * instead) and the unused `actor` binding destructured in minutes.js `line()`.
   * Both are harmless, neither is worth a diff to a submitted app, and neither
   * should silently lower the bar for the rest of src/ — so they warn here and
   * stay errors everywhere else. Delete this block when the app is next touched.
   */
  {
    files: ['src/ui.js', 'src/minutes.js'],
    rules: { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }] }
  },

  // ── the vitest suite: node, plus the DOM names the injection tests reach for ──
  // The suite imports { describe, it, expect } explicitly rather than relying on
  // vitest's globals, so nothing extra needs declaring.
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...browserGlobals, process: 'readonly' }
    },
    rules: correctness
  },

  // ── Playwright specs and the tooling configs: node ────────────────────────
  {
    files: ['e2e/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly' }
    },
    rules: correctness
  }
];
