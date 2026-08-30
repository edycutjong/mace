/**
 * path-extra.test.js — the timing/cancellation plumbing path.test.js's
 * black-box searches never happen to exercise.
 *
 * path.test.js proves explainPathTo() finds correct, honest plans. What it
 * cannot easily prove is the yield/abort machinery itself (maybeYield,
 * performance-API fallbacks, the CANCELLED-with-a-plan and
 * CANCELLED-with-no-plan render() branches) — because on a fast test machine
 * a small search finishes in ~1 ms, long before the real 8 ms yield slice or
 * a `setTimeout(0)` abort ever has a chance to land. Racing real wall-clock
 * timers against real ms-scale work is exactly the kind of test that is
 * fast-machine-flaky, so every case here instead makes the timing
 * DETERMINISTIC by stubbing the two browser globals `explain_path_to` reads
 * (`globalThis.performance`, `globalThis.scheduler`) for the duration of one
 * test, then restoring them. No src/ file is modified by any of this.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { replay } from '../src/fsm.js';
import { GATED_TOOLS } from '../src/ronr.data.js';
import { explainPathTo } from '../src/path.js';

const ROWS = new Map(GATED_TOOLS.map(r => [r.toolName, r]));

const REAL_PERFORMANCE = globalThis.performance;
const REAL_SCHEDULER = globalThis.scheduler;

afterEach(() => {
  globalThis.performance = REAL_PERFORMANCE;
  if (REAL_SCHEDULER === undefined) delete globalThis.scheduler;
  else globalThis.scheduler = REAL_SCHEDULER;
});

/** Forces maybeYield's "a slice has elapsed" branch on every single node. */
function forceEverySliceExceeded() {
  let t = 0;
  globalThis.performance = { now: () => (t += 100) };
}

describe('now() — the performance.now() / Date.now() fallback', () => {
  it('still produces a real plan when window.performance does not exist', async () => {
    delete globalThis.performance;
    const tangle = replay([], ROWS); // FLOOR_CLEAR, nothing pending — a trivial but real search
    const out = await explainPathTo('adjourn_cleanly', tangle, {});
    expect(out).toContain('conditional plan');
  });
});

describe('maybeYield() — scheduler.yield() when it IS available', () => {
  it('uses scheduler.yield() instead of the setTimeout fallback when present', async () => {
    forceEverySliceExceeded();
    let calls = 0;
    globalThis.scheduler = { yield: () => { calls++; return Promise.resolve(); } };
    const tangle = replay([], ROWS);
    const out = await explainPathTo('adjourn_cleanly', tangle, {});
    expect(out).toContain('conditional plan');
    expect(calls).toBeGreaterThan(0);
  });
});

describe('maybeYield() — signal?.aborted with no signal at all', () => {
  it('completes normally when no signal is passed, even once every slice is "exceeded"', async () => {
    forceEverySliceExceeded();
    const tangle = replay([], ROWS);
    const out = await explainPathTo('adjourn_cleanly', tangle, {});
    expect(out).not.toContain('CANCELLED');
  });
});

describe('maybeYield() — a signal that is present but never aborted', () => {
  it('completes normally, even once every slice is "exceeded"', async () => {
    forceEverySliceExceeded();
    const ctl = new AbortController();
    const tangle = replay([], ROWS);
    const out = await explainPathTo('adjourn_cleanly', tangle, { signal: ctl.signal });
    expect(out).not.toContain('CANCELLED');
  });
});

describe('cancellation — deterministic, node-count-triggered aborts', () => {
  // Both cases below use a state that ALREADY satisfies the goal, so the very
  // first node of the very first depth-iteration would return 'done'
  // immediately. Forcing every slice to read as "exceeded" and tying the
  // abort to an exact scheduler.yield() call count turns the usual real-clock
  // race (search finishes before the abort lands, or vice versa) into an
  // exact, repeatable sequence: which node the Cancelled exception interrupts
  // is chosen by the test, not by how fast the machine happens to be.
  const already = { phase: 'ADJOURNED', stack: [], table: [], present: 7, quorum: 5, ruling: null, disposed: [] };

  function abortOnNthYield(n, ctl) {
    let calls = 0;
    globalThis.scheduler = { yield: () => { calls++; if (calls === n) ctl.abort(); return Promise.resolve(); } };
  }

  it('CANCELLED with no plan at all — the very first node is interrupted', async () => {
    forceEverySliceExceeded();
    const ctl = new AbortController();
    abortOnNthYield(1, ctl); // interrupts depth d=1's one and only node
    const out = await explainPathTo('adjourn_cleanly', already, { signal: ctl.signal });
    expect(out).toMatch(/^CANCELLED — no conditional plan reaches/);
    expect(out).toContain('deeper search stopped at your request');
  });

  it('a real error during the search propagates — only Cancelled is swallowed', async () => {
    forceEverySliceExceeded();
    globalThis.scheduler = { yield: () => { throw new Error('boom — a genuine bug, not a cancellation'); } };
    await expect(explainPathTo('adjourn_cleanly', already, {})).rejects.toThrow('boom — a genuine bug, not a cancellation');
  });

  it('CANCELLED with a plan already in hand — the robustness re-search is interrupted', async () => {
    // adjourn_cleanly is satisfied by `already` immediately, so depth d=1
    // finds a one-node plan and sets bestPlan. Iterative deepening then always
    // runs one more depth (ROBUSTNESS_PLIES) to confirm no shorter plan
    // exists; interrupting THAT second pass (the 2nd scheduler.yield() call)
    // is what proves the CANCELLED head still reports the best plan already
    // found, not a blank one.
    forceEverySliceExceeded();
    const ctl = new AbortController();
    abortOnNthYield(2, ctl);
    const out = await explainPathTo('adjourn_cleanly', already, { signal: ctl.signal });
    expect(out).toMatch(/^CANCELLED — best answer found in \d+ ms at depth 1/);
    expect(out).toContain('the assembly has reached the goal');
  });
});

describe('render() — the found-a-plan-mid-vote fallback prose', () => {
  // Every real MOTIONS row has a title and a threshold, so
  // `MOTIONS[t?.motion]?.title ?? 'the pending question'` and its threshold
  // twin never fall back through ordinary play. A state whose immediately
  // pending question carries an unrecognised motion id is not something the
  // reducer ever produces, but it is a value the AND-node's own display logic
  // is written to tolerate — this proves that tolerance directly.
  it('names an unrecognised pending motion generically, with no RONR citation', async () => {
    const state0 = { phase: 'VOTE_PENDING', stack: [{ id: 'x1', motion: 'not_a_real_motion', text: 'x', mover: 'D', seconder: 'M' }], table: [], present: 7, quorum: 5, ruling: null, disposed: [] };
    const out = await explainPathTo('vote_on_the_main_motion', state0, {});
    expect(out).toContain('The vote is taken on the pending question — it needs a majority.');
  });

  it('names a real two-thirds motion with its citation when it is the one pending', async () => {
    const state0 = { phase: 'VOTE_PENDING', stack: [{ id: 'pq1', motion: 'previous_question', text: 'x', mover: 'D', seconder: 'M' }], table: [], present: 7, quorum: 5, ruling: null, disposed: [] };
    const out = await explainPathTo('vote_on_the_main_motion', state0, {});
    expect(out).toContain('The vote is taken on Previous question (§16) — it needs a two-thirds vote.');
  });
});
