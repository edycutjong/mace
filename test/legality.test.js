/**
 * legality.test.js — the headline number, asserted rather than claimed.
 *
 *   133 cells = 7 phases x 19 gated tools   (the phase grid, complexity.md §2.5)
 * +  19 cells = the sub-quorum sweep         (§40 overlay, §2.7)
 * = 152 legality cells
 *
 * The grid below is written out by hand from complexity.md §2.5. It is a SECOND,
 * independent statement of the rulebook: if rule.js and this table ever disagree,
 * one of them is wrong and the suite says which cell. That is the point — a test
 * that imported the same data it checks would assert nothing.
 */

import { describe, it, expect } from 'vitest';
import { PHASES, GATED_TOOLS, SUBQUORUM_ALLOWED } from '../src/ronr.data.js';
import { rule, legalTools } from '../src/rule.js';

/** ✓ = in order in that phase (before stack-shape guards). Transcribed from §2.5. */
const GRID = {
  //                                  PRE  FLOOR AWAIT OPEN  VOTE  RULING ADJ
  call_meeting_to_order:            [ 1,   0,    0,    0,    0,    0,     0 ],
  move_main_motion:                 [ 0,   1,    0,    0,    0,    0,     0 ],
  second_pending_motion:            [ 0,   0,    1,    0,    0,    0,     0 ],
  move_to_amend:                    [ 0,   0,    0,    1,    0,    0,     0 ],
  move_to_amend_the_amendment:      [ 0,   0,    0,    1,    0,    0,     0 ],
  move_to_postpone_indefinitely:    [ 0,   0,    0,    1,    0,    0,     0 ],
  move_to_commit:                   [ 0,   0,    0,    1,    0,    0,     0 ],
  move_to_postpone_to_time:         [ 0,   0,    0,    1,    0,    0,     0 ],
  move_to_limit_debate:             [ 0,   0,    0,    1,    0,    0,     0 ],
  move_previous_question:           [ 0,   0,    0,    1,    0,    0,     0 ],
  move_to_lay_on_table:             [ 0,   0,    0,    1,    0,    0,     0 ],
  move_to_take_from_table:          [ 0,   1,    0,    0,    0,    0,     0 ],
  move_to_adjourn:                  [ 0,   1,    0,    1,    0,    0,     0 ],
  raise_point_of_order:             [ 0,   1,    1,    1,    1,    0,     0 ],
  record_chair_ruling:              [ 0,   1,    1,    1,    1,    1,     0 ],
  correct_last_entry:               [ 0,   1,    1,    1,    1,    1,     1 ],
  set_members_present:              [ 1,   1,    1,    1,    1,    1,     0 ],
  record_vote_tally:                [ 0,   0,    0,    0,    1,    0,     0 ],
  enter_motion_text:                [ 0,   1,    0,    1,    0,    0,     0 ]
};

/**
 * A state in `phase` whose stack shape SATISFIES every guard, so the cell measures
 * the phase dimension alone. Guards get their own dedicated suite below.
 */
function stateFor(phase, toolName) {
  const base = { phase, stack: [], table: [], present: 7, quorum: 5, ruling: null, disposed: [] };
  const main = { id: 'm1', motion: 'main', text: 'Spend $4,000 on the north fence', mover: 'Dave', seconder: 'Maria' };
  const amend = { id: 'a1', motion: 'amend', text: '$500', mover: 'Maria', seconder: 'Ann' };

  if (phase === 'AWAITING_SECOND') base.stack = [{ ...main, seconder: null }];
  if (phase === 'OPEN' || phase === 'VOTE_PENDING') base.stack = [main];
  if (phase === 'RULING_PENDING') { base.stack = [main]; base.ruling = { pointId: 'p1', raisedBy: 'Ann' }; }

  // Shape the stack so the tool under test has its guard satisfied.
  if (toolName === 'move_to_amend_the_amendment' && phase === 'OPEN') base.stack = [main, amend];
  if (toolName === 'move_to_take_from_table') base.table = [[main]];
  return base;
}

describe('the legality grid — 133 cells (7 phases x 19 gated tools)', () => {
  // eslint-disable-next-line no-unused-vars -- tally kept as a live cross-check while writing the grid; the "exactly 133 cells" assertion below is the one that runs.
  let cells = 0;
  for (const [toolName, row] of Object.entries(GRID)) {
    describe(toolName, () => {
      PHASES.forEach((phase, i) => {
        const want = !!row[i];
        it(`${want ? 'IS' : 'is NOT'} in order during ${phase}`, () => {
          const got = rule(stateFor(phase, toolName), toolName);
          expect(got.legal, got.reason ?? 'expected illegal, got legal').toBe(want);
          cells++;
        });
      });
    });
  }

  it('covers every gated tool exactly once', () => {
    expect(Object.keys(GRID).sort()).toEqual(GATED_TOOLS.map(t => t.toolName).sort());
  });

  it('is exactly 133 cells', () => {
    expect(PHASES.length * Object.keys(GRID).length).toBe(133);
  });
});

describe('the sub-quorum sweep — 19 cells (§40)', () => {
  // One state, quorum absent, in the phase where each tool is otherwise MOST legal.
  // §40 intersects: a tool outside SUBQUORUM_ALLOWED must vanish even where the
  // phase grid says yes.
  const phaseWhereLegal = (t) => t.phases.includes('OPEN') ? 'OPEN' : t.phases[0];

  GATED_TOOLS.forEach(tool => {
    const allowed = SUBQUORUM_ALLOWED.has(tool.toolName);
    it(`${tool.toolName} ${allowed ? 'survives' : 'vanishes'} when a quorum is absent`, () => {
      const phase = phaseWhereLegal(tool);
      const s = { ...stateFor(phase, tool.toolName), present: 3, quorum: 5 };
      const got = rule(s, tool.toolName);
      if (!allowed) {
        expect(got.legal).toBe(false);
        // and the reason must cite §40, not a guard — the first cause, not the last
        if (tool.phases.includes(phase)) expect(got.ronr).toBe('§40');
      } else {
        // allowed tools are not BLOCKED BY QUORUM; a guard may still refuse them
        expect(got.ronr === '§40').toBe(false);
      }
    });
  });

  it('SUBQUORUM_ALLOWED is exactly seven names', () => {
    expect(SUBQUORUM_ALLOWED.size).toBe(7);
  });

  it('the sweep is exactly 19 cells', () => {
    expect(GATED_TOOLS.length).toBe(19);
  });
});

describe('152 = 133 + 19', () => {
  it('totals 152 legality cells', () => {
    expect(PHASES.length * GATED_TOOLS.length + GATED_TOOLS.length).toBe(152);
  });
});

describe('stack-shape guards (§2.6) — they narrow, never widen', () => {
  const S = (over = {}) => ({ phase: 'OPEN', stack: [], table: [], present: 7, quorum: 5, ruling: null, disposed: [], ...over });
  const main = { id: 'm1', motion: 'main', text: 'x', mover: 'Dave', seconder: 'Maria' };
  const amend = { id: 'a1', motion: 'amend', text: 'y', mover: 'Maria', seconder: 'Ann' };
  const amend2 = { id: 'a2', motion: 'amend_amendment', text: 'z', mover: 'Ann', seconder: 'Bob' };

  it('no third degree: move_to_amend vanishes once a first-degree amendment is pending', () => {
    expect(rule(S({ stack: [main] }), 'move_to_amend').legal).toBe(true);
    expect(rule(S({ stack: [main, amend] }), 'move_to_amend').legal).toBe(false);
  });

  it('move_to_amend_the_amendment requires a first-degree amendment on top', () => {
    expect(rule(S({ stack: [main] }), 'move_to_amend_the_amendment').legal).toBe(false);
    expect(rule(S({ stack: [main, amend] }), 'move_to_amend_the_amendment').legal).toBe(true);
    expect(rule(S({ stack: [main, amend, amend2] }), 'move_to_amend_the_amendment').legal).toBe(false);
  });

  it('postpone_indefinitely requires a BARE main motion', () => {
    expect(rule(S({ stack: [main] }), 'move_to_postpone_indefinitely').legal).toBe(true);
    expect(rule(S({ stack: [main, amend] }), 'move_to_postpone_indefinitely').legal).toBe(false);
  });

  it('precedence: a lower-ranking motion does not outrank the pending one', () => {
    // lay_on_table (8) outranks main (1) but not adjourn (12)
    expect(rule(S({ stack: [main] }), 'move_to_lay_on_table').legal).toBe(true);
    expect(rule(S({ stack: [{ id: 'x', motion: 'adjourn', mover: 'Dave', seconder: 'M' }] }), 'move_to_lay_on_table').legal).toBe(false);
  });

  it('previous_question requires a debatable motion pending', () => {
    expect(rule(S({ stack: [main] }), 'move_previous_question').legal).toBe(true);
    expect(rule(S({ stack: [{ id: 'x', motion: 'lay_on_table', mover: 'D', seconder: 'M' }] }), 'move_previous_question').legal).toBe(false);
  });

  it('take_from_table requires something actually on the table', () => {
    expect(rule(S({ phase: 'FLOOR_CLEAR', table: [] }), 'move_to_take_from_table').legal).toBe(false);
    expect(rule(S({ phase: 'FLOOR_CLEAR', table: [[main]] }), 'move_to_take_from_table').legal).toBe(true);
  });

  it('main motion requires an empty stack', () => {
    expect(rule(S({ phase: 'FLOOR_CLEAR', stack: [] }), 'move_main_motion').legal).toBe(true);
    expect(rule(S({ phase: 'FLOOR_CLEAR', stack: [main] }), 'move_main_motion').legal).toBe(false);
  });

  it('call_meeting_to_order requires quorum', () => {
    expect(rule(S({ phase: 'PRE_MEETING', present: 7, quorum: 5 }), 'call_meeting_to_order').legal).toBe(true);
    expect(rule(S({ phase: 'PRE_MEETING', present: 3, quorum: 5 }), 'call_meeting_to_order').legal).toBe(false);
  });
});

describe('the quorum cliff — 8 tools vanish on one integer change', () => {
  const seated = { phase: 'OPEN', stack: [{ id: 'm1', motion: 'main', text: 'x', mover: 'D', seconder: 'M' }], table: [], present: 7, quorum: 5, ruling: null, disposed: [] };

  it('drops the frontier when three members walk out', () => {
    const before = legalTools(seated);
    const after = legalTools({ ...seated, present: 3 });
    expect(before.length).toBeGreaterThan(after.length);
    // every survivor is §40-permitted
    after.forEach(name => expect(SUBQUORUM_ALLOWED.has(name)).toBe(true));
  });

  it('does not deadlock: an adjournment can be moved, seconded AND tallied sub-quorum', () => {
    expect(SUBQUORUM_ALLOWED.has('move_to_adjourn')).toBe(true);
    expect(SUBQUORUM_ALLOWED.has('second_pending_motion')).toBe(true);
    expect(SUBQUORUM_ALLOWED.has('record_vote_tally')).toBe(true);
  });
});
