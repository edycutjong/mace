/**
 * effects.js — the 11 named effects, as pure stack transforms.
 *
 * An effect is what ADOPTING a motion does to the stack. `ronr.data.js` names the
 * effect on each motion row (`onAdopt`); this file is the only place that says
 * what the name means. Nothing here touches the DOM, and nothing here decides
 * legality — `rule.js` owns that.
 *
 * Every function takes a state and returns a NEW state. No mutation anywhere.
 */

import { MOTIONS } from './ronr.data.js';

const pop = (stack) => stack.slice(0, -1);
const top = (stack) => stack.length ? stack[stack.length - 1] : null;

/**
 * Merge an adopted amendment into the motion it adheres to. The parent's text is
 * replaced and the amendment's own wording is kept on the parent as a record of
 * how it got there, so the minutes can show the motion "as amended".
 */
function mergeAmendment(stack) {
  const amendment = top(stack);
  const rest = pop(stack);
  const parent = top(rest);
  if (!parent) return rest;
  const amended = {
    ...parent,
    text: amendment.text,
    amendedFrom: [...(parent.amendedFrom ?? []), parent.text]
  };
  return [...pop(rest), amended];
}

/**
 * Dispose of the whole adhering series under the top motion — used by the
 * secondary motions that carry the main motion away with them (§11, §13, §14).
 * Everything from the main motion up leaves the stack together.
 */
function disposeSeries(state, outcome, note) {
  const series = state.stack;
  return {
    ...state,
    stack: [],
    disposed: [...state.disposed, { series, outcome, note, at: state.now }]
  };
}

/**
 * The 11 effects. Each returns the next state; `phaseAfter` is resolved by the
 * caller in fsm.js, which knows whether the stack emptied.
 */
export const EFFECT_FNS = Object.freeze({
  /** §10 — the main motion carries. It and anything still adhering leave together. */
  ADOPT_MAIN: (state) => disposeSeries(state, 'adopted', 'The motion was adopted.'),

  /** §11 — postpone indefinitely kills the main motion without a direct vote on it. */
  KILL_MAIN: (state) => disposeSeries(state, 'killed', 'The motion was postponed indefinitely and is dead for this session.'),

  /** §12 — first or second degree; the amendment merges into what it adheres to. */
  MERGE_AMENDMENT: (state) => ({ ...state, stack: mergeAmendment(state.stack) }),

  /** §13 — the question goes to committee and off the floor. */
  REFER: (state, item) => disposeSeries(state, 'referred', `Referred to ${item?.committee ?? 'committee'}.`),

  /** §14 — deferred to a stated later time. */
  POSTPONE: (state, item) => disposeSeries(state, 'postponed', `Postponed to ${item?.until ?? 'a later time'}.`),

  /** §15 — undebatable, two-thirds; sets a limit and leaves the stack otherwise intact. */
  SET_DEBATE_LIMITS: (state, item) => ({
    ...state,
    stack: pop(state.stack),
    debateLimit: item?.limit ?? null
  }),

  /**
   * §16 — the previous question carries. It leaves the stack and the chair puts
   * the question on whatever is now immediately pending. That re-entry into
   * VOTE_PENDING is T17b, and it is load-bearing: without it the seeded meeting
   * stalls at seq 21.
   */
  CLOSE_DEBATE: (state) => ({ ...state, stack: pop(state.stack), debateClosed: true }),

  /**
   * §17 — the WHOLE adhering series goes to the table together and survives
   * intact, which is precisely what distinguishes it from postponing indefinitely.
   */
  TABLE_SERIES: (state) => {
    const series = pop(state.stack); // the lay_on_table motion itself is spent
    return {
      ...state,
      stack: [],
      table: [...state.table, { id: `t${state.table.length + 1}`, series, at: state.now }]
    };
  },

  /** §34 — the series comes back exactly as it was set aside. */
  RESTORE_SERIES: (state, item) => {
    const idx = state.table.findIndex(t => t.id === item?.motionId);
    const pick = idx >= 0 ? idx : state.table.length - 1;
    const entry = state.table[pick];
    if (!entry) return { ...state, stack: pop(state.stack) };
    return {
      ...state,
      stack: entry.series,
      table: state.table.filter((_, i) => i !== pick)
    };
  },

  /** §21 — terminal. */
  ADJOURN: (state) => ({ ...state, stack: [], phase: 'ADJOURNED' }),

  /** §23 — an interrupt, not a peer phase. The interrupted phase is remembered. */
  OPEN_RULING: (state, item) => ({
    ...state,
    phase: 'RULING_PENDING',
    ruling: { raisedBy: item?.raisedBy, concern: item?.concern, interrupted: state.phase }
  })
});

/** The threshold a motion needs, resolved through its data row. */
export const thresholdFor = (motionId) => MOTIONS[motionId]?.threshold ?? 'majority';

export { top, pop };
