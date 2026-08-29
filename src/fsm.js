/**
 * fsm.js — the reducer. Append-only log in, state out.
 *
 * `reduce` is a pure switch over the transition table in architecture.md §3.4.
 * There is no mutation anywhere and no DOM here. `correct_last_entry` APPENDS a
 * correction rather than editing an entry — which is how real minutes work, so
 * the architecture and the domain agree rather than merely coexisting.
 *
 * Two rows are load-bearing rather than refinements:
 *   T5b  a second on an UNDEBATABLE motion goes straight to VOTE_PENDING — the
 *        chair has no discretion to allow debate on it, so the second and the
 *        putting are one event pair.
 *   T17b adopting the previous question re-enters VOTE_PENDING on the NEWLY
 *        EXPOSED question, not on the one just disposed of.
 */

import { MOTIONS, THRESHOLDS } from './ronr.data.js';
import { EFFECT_FNS, thresholdFor, top } from './effects.js';

/** Bylaws Art. IV §3 — Maple Ridge is a board of nine and fixes a quorum at five. */
export const BOARD_SIZE = 9;
export const QUORUM = 5;

export const initialState = Object.freeze({
  phase: 'PRE_MEETING',
  stack: [],
  table: [],
  present: 0,
  quorum: QUORUM,
  ruling: null,
  disposed: [],
  chair: null,
  openedAt: null,
  debateLimit: null,
  now: null
});

let idSeq = 0;
const nextId = () => `m${++idSeq}`;

/** Which motion a tool pushes, if any. Read straight off the data row. */
const pushes = (toolName, row) => row?.motion && toolName.startsWith('move_') ? row.motion : null;

/**
 * The phase a completed vote lands in. Ordering matters: adjournment is terminal,
 * an emptied stack returns the floor, a closed debate re-puts the newly exposed
 * question (T17b), and anything else returns to debate.
 */
function phaseAfterVote(state) {
  if (state.phase === 'ADJOURNED') return 'ADJOURNED';
  if (state.stack.length === 0) return 'FLOOR_CLEAR';
  if (state.debateClosed) return 'VOTE_PENDING';   // T17b
  return 'OPEN';
}

/**
 * reduce(state, event) -> state'
 *
 * `event.type` is the tool name that produced it, plus two names that are not
 * tools: `put_the_question` (a labelled bench control reserved to the chair —
 * architecture.md §3.6 decision G1-B) and `correction`.
 */
export function reduce(state, event, rowsByName) {
  const { type, payload = {}, at } = event;
  const s = { ...state, now: at };
  const row = rowsByName?.get(type);

  switch (type) {
    // ---- T1 §40 ----------------------------------------------------------
    case 'call_meeting_to_order':
      return { ...s, phase: 'FLOOR_CLEAR', chair: payload.chair, openedAt: payload.at };

    // ---- T20 §40 — no phase change, but it can remove eight tools at once --
    case 'set_members_present':
      return { ...s, present: Number(payload.present) };

    // ---- T21 §48 — appended, never overwritten ---------------------------
    case 'correct_last_entry':
      return s;

    // ---- the declarative motion-entry form initiates; it does not commit ---
    case 'enter_motion_text':
      return s;

    // ---- T5 / T5b §4 -----------------------------------------------------
    case 'second_pending_motion': {
      const t = top(s.stack);
      if (!t) return s;
      const seconded = { ...t, seconder: payload.seconder };
      const stack = [...s.stack.slice(0, -1), seconded];
      // T5b: an undebatable motion is put the moment it is seconded.
      const debatable = MOTIONS[t.motion]?.debatable;
      return { ...s, stack, phase: debatable ? 'OPEN' : 'VOTE_PENDING' };
    }

    // ---- T16 §4 — the chair puts the question. A bench act, not a tool. ----
    case 'put_the_question':
      return { ...s, phase: 'VOTE_PENDING' };

    // ---- T18 §23 — interrupts any phase ----------------------------------
    case 'raise_point_of_order':
      return EFFECT_FNS.OPEN_RULING(s, payload);

    // ---- T19 / T6 §23, §4 -------------------------------------------------
    case 'record_chair_ruling': {
      const back = s.ruling?.interrupted ?? s.phase;
      const struck = payload.disposition === 'strike_pending_motion';
      const stack = struck ? s.stack.slice(0, -1) : s.stack;
      const phase = struck && stack.length === 0
        ? 'FLOOR_CLEAR'
        : (back === 'RULING_PENDING' ? 'OPEN' : back);
      return { ...s, stack, ruling: null, phase };
    }

    // ---- T17 / T17b / T22 §44, §16, §21 -----------------------------------
    case 'record_vote_tally': {
      const t = top(s.stack);
      if (!t) return s;
      const aye = Number(payload.aye ?? 0);
      const nay = Number(payload.nay ?? 0);
      const kind = thresholdFor(t.motion);
      const carried = THRESHOLDS[kind](aye, nay);
      const tally = { aye, nay, abstain: Number(payload.abstain ?? 0), threshold: kind, carried };

      if (!carried) {
        // The motion is lost. It leaves the stack; nothing adhering to it moves.
        const stack = s.stack.slice(0, -1);
        const lost = {
          ...s, stack, debateClosed: false,
          disposed: [...s.disposed, { series: [t], outcome: 'lost', tally, at }]
        };
        return { ...lost, phase: phaseAfterVote(lost) };
      }

      const effect = MOTIONS[t.motion]?.onAdopt;
      const applied = EFFECT_FNS[effect]
        ? EFFECT_FNS[effect]({ ...s, debateClosed: false }, t)
        : { ...s, stack: s.stack.slice(0, -1) };
      const withTally = {
        ...applied,
        disposed: applied.disposed === s.disposed
          ? [...s.disposed, { series: [t], outcome: 'adopted', tally, at }]
          : applied.disposed.map((d, i) => i === applied.disposed.length - 1 ? { ...d, tally } : d)
      };
      return { ...withTally, phase: phaseAfterVote(withTally) };
    }

    // ---- T2, T3, T4, T7-T15 — every motion that pushes the stack ----------
    default: {
      const motion = pushes(type, row);
      if (!motion) return s;
      const item = {
        id: nextId(),
        motion,
        text: payload.text ?? MOTIONS[motion].title,
        mover: payload.mover,
        seconder: null,
        form: payload.form,
        committee: payload.committee,
        until: payload.until,
        limit: payload.limit,
        motionId: payload.motionId
      };
      return { ...s, stack: [...s.stack, item], phase: 'AWAITING_SECOND' };
    }
  }
}

/** Fold a log into a state. The only way a state is ever produced. */
export function replay(events, rowsByName) {
  idSeq = 0;
  return events.reduce((st, ev) => reduce(st, ev, rowsByName), initialState);
}

/** A stable key for the transposition table in path.js. Order-sensitive by design. */
export function canonical(state) {
  return [
    state.phase,
    state.present >= state.quorum ? 'Q' : 'q',
    state.stack.map(i => `${i.motion}${i.seconder ? '+' : '-'}`).join('>'),
    state.table.length
  ].join('|');
}
