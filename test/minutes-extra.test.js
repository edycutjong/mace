/**
 * minutes-extra.test.js — the minute-book line-formatter and explainState(),
 * for the event types and stack shapes the poisoned-seed checkpoints
 * (injection.test.js, replay.test.js) never happen to render.
 *
 * draftMinutes()'s line() switch has one case per event type; the seed log
 * only ever emits a subset of the tools mace registers, so most of the
 * remaining cases (move_to_commit, move_to_postpone_to_time, ...
 * move_to_adjourn, raise_point_of_order, record_chair_ruling's own two
 * branches, and the unrecognised-type fallback) are exercised here directly,
 * one line at a time, the same way draftMinutes is always called: a small
 * events array plus the state it produced.
 */

import { describe, it, expect } from 'vitest';
import { draftMinutes, explainState } from '../src/minutes.js';

const STATE = { present: 7, quorum: 5, chair: 'Dolores Whitfield', stack: [], table: [] };

/** Draft minutes from a single synthetic event, for one line() case at a time. */
const draftOne = (type, payload) => draftMinutes([{ at: '19:00', type, payload }], STATE);

describe('draftMinutes — line() cases the seed log never emits', () => {
  it('move_to_commit', () => {
    expect(draftOne('move_to_commit', { mover: 'Ann', committee: 'Finance' }))
      .toContain('Ann moved to refer the question to Finance (§13).');
  });

  it('move_to_postpone_to_time', () => {
    expect(draftOne('move_to_postpone_to_time', { mover: 'Ann', until: 'March' }))
      .toContain('Ann moved to postpone the question to March (§14).');
  });

  it('move_to_limit_debate', () => {
    expect(draftOne('move_to_limit_debate', { mover: 'Ann', limit: 'two minutes each' }))
      .toContain('Ann moved to limit debate: two minutes each (§15).');
  });

  it('move_to_postpone_indefinitely', () => {
    expect(draftOne('move_to_postpone_indefinitely', { mover: 'Ann' }))
      .toContain('Ann moved to postpone the question indefinitely (§11).');
  });

  it('move_previous_question', () => {
    expect(draftOne('move_previous_question', { mover: 'Ann' }))
      .toContain('Ann moved the previous question (§16).');
  });

  it('move_to_take_from_table', () => {
    expect(draftOne('move_to_take_from_table', { mover: 'Ann' }))
      .toContain('Ann moved to take the question from the table (§34).');
  });

  it('move_to_adjourn', () => {
    expect(draftOne('move_to_adjourn', { mover: 'Ann' }))
      .toContain('Ann moved to adjourn (§21).');
  });

  it('raise_point_of_order', () => {
    expect(draftOne('raise_point_of_order', { raisedBy: 'Ann', concern: 'not germane' }))
      .toContain('Ann raised a point of order (§23): "not germane"');
  });

  it('correct_last_entry', () => {
    expect(draftOne('correct_last_entry', { actor: 'clerk', correction: 'It was $9,500, not $9,000.' }))
      .toContain('CORRECTION, entered by clerk: "It was $9,500, not $9,000." (appended; the entry above stands as first written.)');
  });

  it('an unrecognised event type falls back to printing the type verbatim', () => {
    expect(draftOne('some_future_tool', { x: 1 })).toContain('some_future_tool');
  });
});

describe('draftMinutes — line() fallback defaults', () => {
  it('a line with no `at` timestamp omits the leading time marker', () => {
    const out = draftMinutes([{ type: 'move_main_motion', payload: { text: 'x', mover: 'Ann' } }], STATE);
    expect(out).toContain('Ann moved: "x"');
    expect(out).not.toContain('undefined ·');
  });

  it('set_members_present omits the note sentence when none is given', () => {
    const out = draftOne('set_members_present', { present: 7 });
    expect(out).toContain('The chair counted 7 members present.');
  });

  it('move_to_amend falls back to labelling the form "amend" when none is given', () => {
    const out = draftOne('move_to_amend', { mover: 'Ann', text: 'x' });
    expect(out).toContain('moved to amend (amend, §12)');
  });

  it('record_vote_tally falls back to 0 abstaining when the field is absent', () => {
    const out = draftOne('record_vote_tally', { aye: 5, nay: 1 });
    expect(out).toContain('Abstaining 0.');
  });
});

describe('draftMinutes — record_chair_ruling\'s two branches', () => {
  it('with disposition "none", no strike sentence is appended', () => {
    const out = draftOne('record_chair_ruling', { ruledBy: 'Chair', ruling: 'not_well_taken', disposition: 'none', rationale: 'It is germane.' });
    expect(out).toContain('The chair (Chair) ruled the point not well taken: "It is germane."');
    expect(out).not.toContain('struck from the stack');
  });

  it('with disposition "strike_pending_motion", the strike sentence is appended', () => {
    const out = draftOne('record_chair_ruling', { ruledBy: 'Chair', ruling: 'well_taken', disposition: 'strike_pending_motion', rationale: 'Not germane.' });
    expect(out).toContain('The pending motion was struck from the stack.');
  });
});

describe('draftMinutes — record_vote_tally\'s optional result suffix', () => {
  it('appends ev.result when the caller has attached one', () => {
    const out = draftMinutes([{ at: '19:00', type: 'record_vote_tally', payload: { aye: 5, nay: 1, abstain: 0 }, result: 'ADOPTED (majority)' }], STATE);
    expect(out).toContain('Ayes 5, Noes 1, Abstaining 0. ADOPTED (majority)');
  });

  it('omits the suffix entirely when no result is attached', () => {
    const out = draftMinutes([{ at: '19:00', type: 'record_vote_tally', payload: { aye: 5, nay: 1, abstain: 0 } }], STATE);
    expect(out).toContain('Ayes 5, Noes 1, Abstaining 0.');
    expect(out).not.toMatch(/Abstaining 0\. \S/);
  });
});

describe('draftMinutes — enter_motion_text produces no minute-book line', () => {
  it('is filtered out of the numbered body entirely', () => {
    const out = draftMinutes([
      { at: '19:00', type: 'move_main_motion', payload: { text: 'x', mover: 'Ann' } },
      { at: '19:01', type: 'enter_motion_text', payload: { text: 'y', mover: 'Bob' } }
    ], STATE);
    expect(out).toContain(' 1. ');
    expect(out).not.toContain(' 2. ');
  });
});

describe('draftMinutes — through: matching and not matching', () => {
  const events = [
    { at: '19:00', type: 'move_main_motion', payload: { text: 'the parking motion', mover: 'Ann' } },
    { at: '19:01', type: 'second_pending_motion', payload: { seconder: 'Bob' } }
  ];

  it('cuts the log at the first event whose payload mentions the needle', () => {
    const out = draftMinutes(events, STATE, 'parking');
    expect(out).toContain('the parking motion');
    expect(out).not.toContain('Seconded by Bob');
  });

  it('uses the whole log when the needle matches nothing', () => {
    const out = draftMinutes(events, STATE, 'no such phrase anywhere');
    expect(out).toContain('Seconded by Bob');
  });

  it('matches against events with no payload at all without throwing', () => {
    const bare = [{ at: '19:00', type: 'put_the_question' }, ...events];
    const out = draftMinutes(bare, STATE, 'parking');
    expect(out).toContain('the parking motion');
  });
});

describe('draftMinutes — head, pending and tabled sections', () => {
  it('reports "meeting has not been called to order" when no chair is set', () => {
    const out = draftMinutes([], { present: 3, quorum: 5, chair: null, stack: [], table: [] });
    expect(out).toContain('The meeting has not been called to order.');
  });

  it('reports the presiding chair when one is set', () => {
    const out = draftMinutes([], STATE);
    expect(out).toContain('Presiding: Dolores Whitfield.');
  });

  it('says the floor is clear when nothing is pending', () => {
    const out = draftMinutes([], STATE);
    expect(out).toContain('Nothing is pending; the floor is clear.');
  });

  it('lists a nested pending stack, marking an unseconded top item', () => {
    const state = {
      ...STATE,
      stack: [
        { motion: 'main', text: 'Spend $4,000', seconder: 'Bob' },
        { motion: 'amend', text: '$500', seconder: null }
      ]
    };
    const out = draftMinutes([], state);
    expect(out).toContain('STILL PENDING AT THIS POINT:');
    expect(out).toContain('Amend (first degree) — "$500" (awaiting a second)');
  });

  it('nameOf falls back to the raw motion id when it is not a known MOTIONS key', () => {
    // Every real motion id resolves through MOTIONS; this proves nameOf()'s
    // own `?? m` fallback for an id it does not recognise.
    const state = { ...STATE, stack: [{ motion: 'not_a_real_motion', text: 'x', seconder: 'Ann' }] };
    const out = draftMinutes([], state);
    expect(out).toContain('not_a_real_motion — "x"');
  });

  it('lists a tabled series when the table is non-empty', () => {
    const state = { ...STATE, table: [{ id: 't1', series: [{ motion: 'main', text: 'the fence motion' }] }] };
    const out = draftMinutes([], state);
    expect(out).toContain('ON THE TABLE:');
    expect(out).toContain('t1 — Main motion: "the fence motion"');
  });
});

describe('explainState()', () => {
  it('describes an empty stack as nothing immediately pending', () => {
    const out = explainState({ phase: 'FLOOR_CLEAR', stack: [], present: 7, quorum: 5, table: [] }, 4);
    expect(out).toContain('Nothing is immediately pending.');
  });

  it('describes an unseconded top item as "not yet seconded"', () => {
    const out = explainState({ phase: 'AWAITING_SECOND', stack: [{ motion: 'main', seconder: null }], present: 7, quorum: 5, table: [] }, 1);
    expect(out).toContain('not yet seconded');
  });

  it('describes a seconded top item as "seconded"', () => {
    const out = explainState({ phase: 'OPEN', stack: [{ motion: 'main', seconder: 'Ann' }], present: 7, quorum: 5, table: [] }, 1);
    expect(out).toMatch(/\bseconded\b/);
  });

  it('reports quorum ABSENT and the §40 restriction when present < quorum', () => {
    const out = explainState({ phase: 'OPEN', stack: [], present: 3, quorum: 5, table: [] }, 5);
    expect(out).toMatch(/quorum is ABSENT/);
    expect(out).toContain('only adjournment, points of order, correcting the record');
  });

  it('reports quorum present and omits the §40 sentence when quorum is met', () => {
    const out = explainState({ phase: 'OPEN', stack: [], present: 7, quorum: 5, table: [] }, 5);
    expect(out).toMatch(/quorum is present/);
    expect(out).not.toContain('§40');
  });

  it('mentions the table only when something is actually on it', () => {
    const withTable = explainState({ phase: 'FLOOR_CLEAR', stack: [], present: 7, quorum: 5, table: [{ id: 't1' }] }, 5);
    expect(withTable).toContain('on the table and may be taken up');
    const withoutTable = explainState({ phase: 'FLOOR_CLEAR', stack: [], present: 7, quorum: 5, table: [] }, 5);
    expect(withoutTable).not.toContain('on the table');
  });

  it('reports the count of legal acts passed in', () => {
    const out = explainState({ phase: 'FLOOR_CLEAR', stack: [], present: 7, quorum: 5, table: [] }, 12);
    expect(out).toContain('12 acts are in order right now.');
  });
});
