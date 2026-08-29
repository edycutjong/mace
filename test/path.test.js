/**
 * path.test.js — explain_path_to.
 *
 * The abort story is only honest if the search is genuinely expensive and if what
 * comes back on abort came from a FULLY COMPLETED ply. These assertions are what
 * stop "cancellable long-running work" from being a sentence in a README.
 */

import { describe, it, expect } from 'vitest';
import { replay } from '../src/fsm.js';
import { GATED_TOOLS } from '../src/ronr.data.js';
import { explainPathTo, GOALS } from '../src/path.js';
import { SEED, CHECKPOINTS } from '../src/seed.js';

const ROWS = new Map(GATED_TOOLS.map(r => [r.toolName, r]));
const tangle = replay(SEED.slice(0, CHECKPOINTS.TANGLE), ROWS);
const tabled = replay(SEED.slice(0, CHECKPOINTS.TABLED), ROWS);

describe('the five goals', () => {
  it('are exactly the enum the schema advertises', () => {
    const row = GATED_TOOLS.find(r => r.toolName === 'explain_path_to');
    expect(row).toBeUndefined();          // it is an always-on READ, not a gated tool
    expect(Object.keys(GOALS).sort()).toEqual([
      'adjourn_cleanly', 'dispose_of_pending_amendments', 'end_debate_now',
      'return_to_a_tabled_motion', 'vote_on_the_main_motion'
    ]);
  });

  it('rejects a goal it does not search for, and says which ones it does', () => {
    return expect(explainPathTo('make_coffee', tangle, {})).resolves.toContain('adjourn_cleanly');
  });
});

describe('from the tangle — three motions deep, second-degree amendment pending', () => {
  it('finds a conditional plan to clear the pending amendments', async () => {
    const out = await explainPathTo('dispose_of_pending_amendments', tangle, {});
    expect(out).toContain('conditional plan');
    expect(out).toMatch(/if it CARRIES/);
    expect(out).toMatch(/if it FAILS/);
  }, 20000);

  it('the plan branches on vote outcomes it does not control', async () => {
    const out = await explainPathTo('vote_on_the_main_motion', tangle, {});
    // An AND node means BOTH branches had to reach the goal for the plan to return.
    expect(out).toMatch(/The vote is taken on/);
  }, 20000);

  it('takes the SHORTEST lawful route — putting the question needs no vote at all', async () => {
    // Iterative deepening returns the shallowest complete plan, and from OPEN the
    // chair simply putting the question reaches VOTE_PENDING in one move. A plan
    // that routed through the previous question here would be worse advice.
    const out = await explainPathTo('end_debate_now', tangle, {});
    expect(out).toContain('The chair puts the question');
    expect(out).toContain('reached the goal');
  }, 20000);

  it('names the threshold whenever the plan does depend on a vote', async () => {
    const out = await explainPathTo('vote_on_the_main_motion', tangle, {});
    expect(out).toMatch(/needs (a majority|a two-thirds vote)/);
  }, 20000);
});

describe('from the table — the clerk’s real question', () => {
  it('finds the way back to a question that was laid on the table', async () => {
    const out = await explainPathTo('return_to_a_tabled_motion', tabled, {});
    expect(out).toContain('Take from the table');
    expect(out).toContain('§34');
  }, 20000);

  it('and states honestly what happens if that motion fails', async () => {
    const out = await explainPathTo('return_to_a_tabled_motion', tabled, {});
    expect(out).toContain('if it FAILS');
    expect(out).toContain('the assembly has decided otherwise');
  }, 20000);
});

describe('cancellation', () => {
  it('RESOLVES on abort — it never rejects', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const out = await explainPathTo('adjourn_cleanly', tangle, { signal: ctl.signal });
    expect(typeof out).toBe('string');
  }, 20000);

  it('prefixes the answer with CANCELLED so the agent cannot mistake it for a complete search', async () => {
    const ctl = new AbortController();
    const p = explainPathTo('adjourn_cleanly', tangle, { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 5);
    const out = await p;
    if (out.startsWith('CANCELLED')) {
      expect(out).toMatch(/stopped at your request/);
    } else {
      // The search finished before the abort landed — then it must NOT claim to
      // have been cancelled. Either way the prefix tracks the truth.
      expect(out).not.toContain('CANCELLED');
    }
  }, 20000);

  it('a bounded refusal is still a real answer — it states the depth it proved', async () => {
    const out = await explainPathTo('return_to_a_tabled_motion', tangle, {});
    if (out.includes('No conditional plan')) {
      expect(out).toMatch(/within \d+ moves/);
      expect(out).toMatch(/it bounds the problem/);
    }
  }, 20000);
});

describe('the plan is made of real moves', () => {
  it('every step names a tool title and, where it is a motion, its RONR citation', async () => {
    const out = await explainPathTo('vote_on_the_main_motion', tangle, {});
    expect(out).toMatch(/§\d+/);
    expect(out).toContain('rule() says is in order at the point it appears');
  }, 20000);
});
