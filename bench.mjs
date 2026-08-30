/**
 * bench.mjs — the numbers on the judged surfaces, measured rather than asserted.
 *
 *   npm run bench          real run: Chrome 151 against the LIVE origin (the headline)
 *   npm run bench:replay   deterministic replay over the pure modules only (CI)
 *
 * There is no kill-switch flag on the headline command on purpose. The real run drives
 * document.modelContext on the deployed origin — the same API a judge's agent would use.
 *
 * WHY THE HEADLINE IS A DIVERGENCE COUNT AND NOT A LATENCY
 * mace's claim is not that it is fast. It is that the panel cannot lie: the left column
 * is rendered from getTools() itself, so the number on screen and the API's own answer
 * are the same value or the product is broken. That is the thing worth proving N times.
 * Latency is real and reported, but it is a supporting number, not the claim.
 *
 * Exits non-zero if any correctness gate fails. It is a verification script, not a
 * print script.
 */
import { chromium } from 'playwright';

const URL = process.env.BENCH_URL ?? 'https://pointoforder.netlify.app';
const TRIALS = Number(process.env.BENCH_TRIALS ?? 30);
const WARMUP = 5;
const SEED = 42;                       // fixed; the seeded meeting is src/seed.js, checked in

const q = (a, p) => a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN;
const f2 = (n) => Number.isFinite(n) ? n.toFixed(2) : '—';
const fails = [];
const gate = (ok, label, got) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${got}`);
  if (!ok) fails.push(`${label} — got ${got}`);
};

// The four checkpoints, and the count getTools() must return at each.
const CHECKPOINTS = [
  ['at load',           null,            5],
  ['widest frontier',   '#load-widest', 17],
  ['the tangle',        '#load-tangle', 15],
];

const main = async () => {
  console.log(`\nmace bench · ${URL} · trials=${TRIALS} (warmup ${WARMUP} discarded) · seed=${SEED}\n`);
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'networkidle' });

  const live = await page.evaluate(() => !!document.modelContext);
  gate(live, 'document.modelContext resolved on the live origin', live);
  if (!live) { await browser.close(); return finish(t0, {}, 0); }

  // ── correctness: getTools() vs the on-screen count, at every checkpoint ──────
  let comparisons = 0, divergences = 0;
  const getMs = [];
  for (const [label, btn, expect] of CHECKPOINTS) {
    if (btn) { await page.click(btn); await page.waitForTimeout(450); }
    for (let i = 0; i < TRIALS + WARMUP; i++) {
      const r = await page.evaluate(async () => {
        const t = performance.now();
        const n = (await document.modelContext.getTools()).length;
        return { ms: performance.now() - t, n, panel: Number(document.getElementById('in-order-count').textContent) };
      });
      if (i >= WARMUP) { getMs.push(r.ms); comparisons++; if (r.n !== r.panel) divergences++; }
      if (i === WARMUP && r.n !== expect) gate(false, `getTools() ${label}`, `${r.n}, expected ${expect}`);
    }
    const n = await page.evaluate(async () => (await document.modelContext.getTools()).length);
    gate(n === expect, `getTools() ${label}`, n);
  }

  // ── the quorum cliff: one integer, and how long the surface takes to settle ──
  const cliffMs = [];
  let removed = null, declarative = null;
  for (let i = 0; i < TRIALS + WARMUP; i++) {
    await page.click('#load-widest'); await page.waitForTimeout(120);
    const before = await page.evaluate(async () => (await document.modelContext.getTools()).map(t => t.name));
    await page.fill('#attendance input[name=present]', '4');
    const r = await page.evaluate(async () => {
      const t = performance.now();
      document.querySelector('#attendance button[type=submit]').click();
      // settle = the API itself reports the new surface, not a timer we chose
      let names; do { names = (await document.modelContext.getTools()).map(x => x.name); } while (names.length === 17);
      return { ms: performance.now() - t, names };
    });
    if (i >= WARMUP) {
      cliffMs.push(r.ms);
      const gone = before.filter(x => !r.names.includes(x));
      removed = gone.length;
      declarative = gone.filter(x => x === 'enter_motion_text').length;
    }
  }
  gate(removed === 8, 'quorum cliff removes exactly 8 tools', removed);
  gate(declarative === 1, '…of which exactly 1 is declarative (enter_motion_text)', declarative);

  // ── explain_path_to: the AND-OR search ──────────────────────────────────────
  await page.click('#load-tangle'); await page.waitForTimeout(400);
  const searchMs = []; let depth = null, nodes = null;
  for (let i = 0; i < TRIALS + WARMUP; i++) {
    const r = await page.evaluate(async () => {
      const { runTool } = await import('/src/webmcp.js');
      const t = performance.now();
      const out = await runTool('explain_path_to', { goal: 'vote_on_the_main_motion' }, {});
      return { ms: performance.now() - t, out };
    });
    if (i >= WARMUP) {
      searchMs.push(r.ms);
      const m = r.out.match(/depth (\d+) in [\d.]+ ms over (\d+) nodes/);
      if (m) { depth = +m[1]; nodes = +m[2]; }
    }
  }
  gate(depth === 6, 'search proves complete to depth 6', depth);
  gate(nodes === 399, 'search explores exactly 399 nodes', nodes);

  gate(divergences === 0, 'getTools() vs on-screen count — divergences', `${divergences} of ${comparisons}`);

  await browser.close();
  finish(t0, { getMs, cliffMs, searchMs }, comparisons);
};

const finish = (t0, m, comparisons) => {
  const row = (name, a) => a?.length
    ? `  ${name.padEnd(34)} ${f2(q(a, .5)).padStart(8)} ${f2(q(a, .95)).padStart(9)} ${f2(Math.max(...a)).padStart(8)} ${String(a.length).padStart(5)}`
    : null;
  console.log(`\n  ${'scenario'.padEnd(34)} ${'p50 ms'.padStart(8)} ${'p95 ms'.padStart(9)} ${'max ms'.padStart(8)} ${'n'.padStart(5)}`);
  console.log('  ' + '-'.repeat(68));
  [row('getTools() round trip', m.getMs),
   row('quorum cliff, submit → settled', m.cliffMs),
   row('explain_path_to (depth 6/399)', m.searchMs)].filter(Boolean).forEach(r => console.log(r));

  console.log(`\n  HEADLINE  ${comparisons} getTools()-vs-screen comparisons, ${fails.some(f => f.includes('divergence')) ? 'DIVERGENCES FOUND' : '0 divergences'}`);
  console.log(`  wall clock ${((Date.now() - t0) / 1000).toFixed(1)}s · provider spend $0.00 (no backend, no model calls, 0 runtime dependencies)\n`);
  if (fails.length) { console.log('FAILED:\n' + fails.map(f => '  - ' + f).join('\n') + '\n'); process.exit(1); }
  console.log('All gates passed.\n');
};

main().catch((e) => { console.error(e); process.exit(1); });
