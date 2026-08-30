/**
 * fsm-extra.test.js — reduce() branches replay.test.js's real-meeting log
 * never happens to hit.
 *
 * replay.test.js proves the reducer against the ACTUAL seeded meeting; that
 * meeting is one true story and was never going to visit every corner of a
 * general-purpose reducer (two clerical event types the seed never emits,
 * defensive "nothing there yet" guards, an ill-formed payload, a nested point
 * of order). Every case below calls reduce()/canonical() directly with a
 * hand-built state or event — never touching src/fsm.js itself — the same
 * way replay.test.js drives it, just with inputs the seed log doesn't produce.
 */

import { describe, it, expect } from 'vitest';
import { reduce, initialState, canonical } from '../src/fsm.js';
import { GATED_TOOLS } from '../src/ronr.data.js';

const ROWS = new Map(GATED_TOOLS.map(r => [r.toolName, r]));

describe('correct_last_entry and enter_motion_text — no-ops on state', () => {
  it('correct_last_entry does not touch the stack or phase', () => {
    const s = { ...initialState, phase: 'OPEN', stack: [{ id: 'm1', motion: 'main' }] };
    const out = reduce(s, { type: 'correct_last_entry', payload: { correction: 'x', actor: 'clerk' }, at: '19:50' }, ROWS);
    expect(out.stack).toBe(s.stack);
    expect(out.phase).toBe('OPEN');
    expect(out.now).toBe('19:50');
  });

  it('enter_motion_text initiates the form but commits nothing to the log-derived state', () => {
    const s = { ...initialState, phase: 'FLOOR_CLEAR' };
    const out = reduce(s, { type: 'enter_motion_text', payload: { text: 'x', mover: 'D' } }, ROWS);
    expect(out.stack).toEqual([]);
    expect(out.phase).toBe('FLOOR_CLEAR');
  });
});

describe('second_pending_motion with nothing pending', () => {
  it('is a no-op when the stack is empty', () => {
    const out = reduce(initialState, { type: 'second_pending_motion', payload: { seconder: 'Ann' } }, ROWS);
    expect(out.stack).toEqual([]);
    expect(out.phase).toBe(initialState.phase);
  });
});

describe('record_vote_tally with nothing pending', () => {
  it('is a no-op when the stack is empty', () => {
    const out = reduce(initialState, { type: 'record_vote_tally', payload: { aye: 5, nay: 0 } }, ROWS);
    expect(out.stack).toEqual([]);
    expect(out.disposed).toEqual([]);
  });
});

describe('record_vote_tally — payload defaults', () => {
  const pending = { ...initialState, phase: 'VOTE_PENDING', present: 7, stack: [{ id: 'm1', motion: 'main', text: 'x', mover: 'D', seconder: 'M' }] };

  it('defaults aye, nay and abstain to 0 when omitted', () => {
    const out = reduce(pending, { type: 'record_vote_tally', payload: {} }, ROWS);
    const tally = out.disposed.at(-1).tally;
    expect(tally).toEqual({ aye: 0, nay: 0, abstain: 0, threshold: 'majority', carried: false });
  });
});

describe('record_vote_tally — adopting a motion with no registered effect', () => {
  it('falls back to a plain pop when MOTIONS has no onAdopt for the motion', () => {
    // Every real MOTIONS row has an onAdopt; this proves the reducer's own
    // fallback for a motion id it does not recognise, and simultaneously
    // proves thresholdFor()'s "majority" default for the same unknown id.
    const s = { ...initialState, phase: 'VOTE_PENDING', present: 7, stack: [{ id: 'x1', motion: 'not_a_real_motion', text: 'x', mover: 'D', seconder: 'M' }] };
    const out = reduce(s, { type: 'record_vote_tally', payload: { aye: 5, nay: 1 } }, ROWS);
    expect(out.stack).toEqual([]);
    expect(out.disposed.at(-1).outcome).toBe('adopted');
    expect(out.disposed.at(-1).tally.threshold).toBe('majority');
  });
});

describe('record_chair_ruling — the two branches replay.test.js does not reach', () => {
  it('clears the floor when striking the ONLY pending motion empties the stack', () => {
    const raised = { ...initialState, phase: 'RULING_PENDING', present: 7, stack: [{ id: 'm1', motion: 'main', text: 'x', mover: 'D', seconder: 'M' }], ruling: { raisedBy: 'Ann', concern: 'not germane', interrupted: 'OPEN' } };
    const out = reduce(raised, { type: 'record_chair_ruling', payload: { ruledBy: 'Chair', ruling: 'well_taken', disposition: 'strike_pending_motion', rationale: 'not germane' } }, ROWS);
    expect(out.stack).toEqual([]);
    expect(out.phase).toBe('FLOOR_CLEAR');
  });

  it('returns to OPEN when a ruling was itself interrupted by a nested point of order', () => {
    // raise_point_of_order is only gated as legal outside RULING_PENDING
    // (rule.js), but reduce() is a general-purpose pure function and does not
    // itself enforce that — this proves the reducer's own handling of
    // `back === 'RULING_PENDING'` when a second point of order is raised
    // while the first is still pending.
    const firstRuling = { ...initialState, phase: 'OPEN', present: 7, stack: [{ id: 'm1', motion: 'main', text: 'x', mover: 'D', seconder: 'M' }], ruling: { raisedBy: 'Ann', concern: 'first', interrupted: 'OPEN' } };
    const nested = reduce({ ...firstRuling, phase: 'RULING_PENDING' }, { type: 'raise_point_of_order', payload: { concern: 'second', raisedBy: 'Bob' } }, ROWS);
    expect(nested.ruling.interrupted).toBe('RULING_PENDING');

    const ruled = reduce(nested, { type: 'record_chair_ruling', payload: { ruledBy: 'Chair', ruling: 'not_well_taken', disposition: 'none', rationale: 'x' } }, ROWS);
    expect(ruled.phase).toBe('OPEN');
  });
});

describe('the default (pushing) case — pushes() branch combinations', () => {
  it('pushes nothing when the row for the type is missing (rowsByName has no entry)', () => {
    const out = reduce({ ...initialState, phase: 'FLOOR_CLEAR' }, { type: 'move_main_motion', payload: { text: 'x', mover: 'D' } }, new Map());
    expect(out.stack).toEqual([]);
  });

  it('pushes nothing for a type that does not start with "move_", even if its row carries a motion', () => {
    const rows = new Map([['custom_type', { motion: 'main' }]]);
    const out = reduce({ ...initialState, phase: 'FLOOR_CLEAR' }, { type: 'custom_type', payload: {} }, rows);
    expect(out.stack).toEqual([]);
  });

  it('pushes nothing for a "move_" type whose row carries no motion', () => {
    const rows = new Map([['move_nothing', { motion: null }]]);
    const out = reduce({ ...initialState, phase: 'FLOOR_CLEAR' }, { type: 'move_nothing', payload: {} }, rows);
    expect(out.stack).toEqual([]);
  });

  it('an unrecognised event type with no rowsByName at all is a no-op', () => {
    const out = reduce(initialState, { type: 'totally_unknown_event', payload: {} }, undefined);
    expect(out.stack).toEqual([]);
    expect(out.phase).toBe(initialState.phase);
  });
});

describe('canonical() — the transposition key', () => {
  it('marks quorum present as "Q"', () => {
    const key = canonical({ phase: 'OPEN', present: 7, quorum: 5, stack: [], table: [] });
    expect(key).toContain('|Q|');
  });

  it('marks quorum absent as "q"', () => {
    const key = canonical({ phase: 'OPEN', present: 3, quorum: 5, stack: [], table: [] });
    expect(key).toContain('|q|');
  });

  it('marks a seconded stack item with "+" and an unseconded one with "-"', () => {
    const seconded = canonical({ phase: 'OPEN', present: 7, quorum: 5, stack: [{ motion: 'main', seconder: 'Ann' }], table: [] });
    const unseconded = canonical({ phase: 'AWAITING_SECOND', present: 7, quorum: 5, stack: [{ motion: 'main', seconder: null }], table: [] });
    expect(seconded).toContain('main+');
    expect(unseconded).toContain('main-');
  });
});
