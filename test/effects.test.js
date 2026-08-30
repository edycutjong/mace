/**
 * effects.test.js — the 11 named effects, exercised directly as the pure
 * stack transforms they are documented to be. replay.test.js and path.test.js
 * already drive most of these through the reducer with realistic payloads;
 * this file targets the defensive/default branches that only show up with
 * inputs the live app happens never to send — an amendment adopted with
 * nothing left under it, an effect called without its optional `item`, a
 * take-from-table vote with no matching (or no) table entry.
 */

import { describe, it, expect } from 'vitest';
import { EFFECT_FNS, thresholdFor, top, pop } from '../src/effects.js';

const S = (over = {}) => ({ stack: [], table: [], disposed: [], now: '19:00', ...over });

describe('top() / pop() — the local stack helpers', () => {
  it('top() is null on an empty stack, the last item otherwise', () => {
    expect(top([])).toBeNull();
    const a = { id: 'a' }, b = { id: 'b' };
    expect(top([a, b])).toBe(b);
  });

  it('pop() drops the last item without mutating the input', () => {
    const stack = Object.freeze([{ id: 'a' }, { id: 'b' }]);
    expect(pop(stack)).toEqual([{ id: 'a' }]);
  });
});

describe('MERGE_AMENDMENT — §12', () => {
  it('merges the amendment into its parent and records the prior wording', () => {
    const parent = { id: 'm1', motion: 'main', text: 'old' };
    const amendment = { id: 'a1', motion: 'amend', text: 'new' };
    const out = EFFECT_FNS.MERGE_AMENDMENT(S({ stack: [parent, amendment] }));
    expect(out.stack).toHaveLength(1);
    expect(out.stack[0].text).toBe('new');
    expect(out.stack[0].amendedFrom).toEqual(['old']);
  });

  it('stacks amendedFrom across a second-degree merge', () => {
    const parent = { id: 'm1', motion: 'main', text: 'old', amendedFrom: ['original'] };
    const amendment = { id: 'a1', motion: 'amend', text: 'new' };
    const out = EFFECT_FNS.MERGE_AMENDMENT(S({ stack: [parent, amendment] }));
    expect(out.stack[0].amendedFrom).toEqual(['original', 'old']);
  });

  it('an amendment with nothing left under it merges into an empty stack (defensive branch)', () => {
    // Not reachable through legal play — an amendment can only be moved while
    // something is already pending (guard: amendableAndNoFirstDegreePending) —
    // but MERGE_AMENDMENT is a pure function of whatever stack it is handed,
    // and it defends against a missing parent explicitly (`if (!parent) return rest;`).
    const amendment = { id: 'a1', motion: 'amend', text: 'orphan' };
    const out = EFFECT_FNS.MERGE_AMENDMENT(S({ stack: [amendment] }));
    expect(out.stack).toEqual([]);
  });
});

describe('REFER — §13', () => {
  it('names the committee it was referred to', () => {
    const out = EFFECT_FNS.REFER(S({ stack: [{ id: 'm1', motion: 'main' }] }), { committee: 'Finance' });
    expect(out.disposed.at(-1).note).toBe('Referred to Finance.');
  });

  it('falls back to "committee" when no item is given', () => {
    const out = EFFECT_FNS.REFER(S({ stack: [{ id: 'm1', motion: 'main' }] }), undefined);
    expect(out.disposed.at(-1).note).toBe('Referred to committee.');
  });
});

describe('POSTPONE — §14', () => {
  it('names the time it was postponed to', () => {
    const out = EFFECT_FNS.POSTPONE(S({ stack: [{ id: 'm1', motion: 'main' }] }), { until: 'March' });
    expect(out.disposed.at(-1).note).toBe('Postponed to March.');
  });

  it('falls back to "a later time" when no item is given', () => {
    const out = EFFECT_FNS.POSTPONE(S({ stack: [{ id: 'm1', motion: 'main' }] }), undefined);
    expect(out.disposed.at(-1).note).toBe('Postponed to a later time.');
  });
});

describe('SET_DEBATE_LIMITS — §15', () => {
  it('records the stated limit', () => {
    const out = EFFECT_FNS.SET_DEBATE_LIMITS(S({ stack: [{ id: 'm1' }] }), { limit: 'two minutes each' });
    expect(out.debateLimit).toBe('two minutes each');
    expect(out.stack).toEqual([]);
  });

  it('falls back to null when no item is given', () => {
    const out = EFFECT_FNS.SET_DEBATE_LIMITS(S({ stack: [{ id: 'm1' }] }), undefined);
    expect(out.debateLimit).toBeNull();
  });
});

describe('CLOSE_DEBATE — §16', () => {
  it('pops the previous question and marks debate closed', () => {
    const out = EFFECT_FNS.CLOSE_DEBATE(S({ stack: [{ id: 'm1' }, { id: 'pq' }] }));
    expect(out.stack).toEqual([{ id: 'm1' }]);
    expect(out.debateClosed).toBe(true);
  });
});

describe('TABLE_SERIES — §17', () => {
  it('moves the whole adhering series to the table intact', () => {
    const series = [{ id: 'm1', motion: 'main' }, { id: 'a1', motion: 'amend' }];
    const out = EFFECT_FNS.TABLE_SERIES(S({ stack: [...series, { id: 'lot', motion: 'lay_on_table' }], table: [] }));
    expect(out.stack).toEqual([]);
    expect(out.table).toHaveLength(1);
    expect(out.table[0].series).toEqual(series);
    expect(out.table[0].id).toBe('t1');
  });

  it('numbers a second tabled series t2', () => {
    const existing = [{ id: 't1', series: [{ id: 'x' }], at: '19:00' }];
    const out = EFFECT_FNS.TABLE_SERIES(S({ stack: [{ id: 'm2' }, { id: 'lot' }], table: existing }));
    expect(out.table).toHaveLength(2);
    expect(out.table[1].id).toBe('t2');
  });
});

describe('RESTORE_SERIES — §34', () => {
  const tabled = { id: 't1', series: [{ id: 'm1', motion: 'main' }], at: '19:00' };

  it('restores the named series by motionId and removes it from the table', () => {
    const out = EFFECT_FNS.RESTORE_SERIES(S({ stack: [{ id: 'tft' }], table: [tabled] }), { motionId: 't1' });
    expect(out.stack).toEqual(tabled.series);
    expect(out.table).toEqual([]);
  });

  it('falls back to the last tabled entry when motionId is missing', () => {
    const out = EFFECT_FNS.RESTORE_SERIES(S({ stack: [{ id: 'tft' }], table: [tabled] }), undefined);
    expect(out.stack).toEqual(tabled.series);
  });

  it('falls back to the last entry when motionId does not match anything on the table', () => {
    const out = EFFECT_FNS.RESTORE_SERIES(S({ stack: [{ id: 'tft' }], table: [tabled] }), { motionId: 'does-not-exist' });
    expect(out.stack).toEqual(tabled.series);
  });

  it('pops the mover and leaves the stack empty when the table itself is empty (defensive branch)', () => {
    // Not reachable through legal play — move_to_take_from_table requires
    // somethingOnTable — but RESTORE_SERIES is a pure function and defends
    // against an empty table explicitly (`if (!entry) return { ...pop... }`).
    const out = EFFECT_FNS.RESTORE_SERIES(S({ stack: [{ id: 'tft' }], table: [] }), { motionId: 't1' });
    expect(out.stack).toEqual([]);
  });
});

describe('ADOPT_MAIN / KILL_MAIN / ADJOURN / OPEN_RULING', () => {
  it('ADOPT_MAIN disposes the whole series as adopted', () => {
    const series = [{ id: 'm1', motion: 'main' }];
    const out = EFFECT_FNS.ADOPT_MAIN(S({ stack: series }));
    expect(out.stack).toEqual([]);
    expect(out.disposed.at(-1)).toMatchObject({ series, outcome: 'adopted', note: 'The motion was adopted.' });
  });

  it('KILL_MAIN disposes the series as killed', () => {
    const series = [{ id: 'm1', motion: 'main' }];
    const out = EFFECT_FNS.KILL_MAIN(S({ stack: series }));
    expect(out.disposed.at(-1).outcome).toBe('killed');
  });

  it('ADJOURN clears the stack and sets the terminal phase', () => {
    const out = EFFECT_FNS.ADJOURN(S({ stack: [{ id: 'm1' }] }));
    expect(out.stack).toEqual([]);
    expect(out.phase).toBe('ADJOURNED');
  });

  it('OPEN_RULING records who raised it, the concern, and the interrupted phase', () => {
    const out = EFFECT_FNS.OPEN_RULING(S({ phase: 'OPEN' }), { raisedBy: 'Ann', concern: 'not germane' });
    expect(out.phase).toBe('RULING_PENDING');
    expect(out.ruling).toEqual({ raisedBy: 'Ann', concern: 'not germane', interrupted: 'OPEN' });
  });
});

describe('thresholdFor()', () => {
  it('reads the threshold off the motion row', () => {
    expect(thresholdFor('previous_question')).toBe('two_thirds');
    expect(thresholdFor('main')).toBe('majority');
  });

  it('falls back to "majority" for an unknown motion id', () => {
    expect(thresholdFor('not_a_real_motion')).toBe('majority');
    expect(thresholdFor(undefined)).toBe('majority');
  });
});
