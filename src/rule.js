/**
 * rule.js — the only place that decides what is in order.
 *
 * rule(state, toolName) -> { legal, ronr, reason }
 *
 * Two dimensions, intersected, never added to:
 *   1. the phase grid   (ronr.data.js GATED_TOOLS[].phases)  — 7 x 19 = 133 cells
 *   2. stack-shape guards (below)                             — can only REMOVE legality
 *   3. the quorum overlay (§40)                               — intersects both
 *
 * legalTools(state) is what webmcp.js registers and what the "What is in order
 * now" panel renders. There is no third path: if a tool is not returned here it
 * does not exist to be called.
 */

import { MOTIONS, GATED_TOOLS, SUBQUORUM_ALLOWED } from './ronr.data.js';

const BY_NAME = new Map(GATED_TOOLS.map(t => [t.toolName, t]));

/** Immediately pending question — the top of the stack, or null. */
export const top = (state) => state.stack.length ? state.stack[state.stack.length - 1] : null;

/** Rank of the immediately pending motion. Nothing pending ranks 0, so anything outranks it. */
const topRank = (state) => {
  const t = top(state);
  if (!t) return 0;
  const r = MOTIONS[t.motion]?.rank;
  return r == null ? 0 : r;
};

/**
 * Stack-shape guards (complexity.md §2.6). Each returns { ok, reason }.
 * A guard may only narrow the phase grid.
 */
const GUARDS = {
  quorumPresent: (s) => s.present >= s.quorum
    ? { ok: true }
    : { ok: false, reason: `Only ${s.present} members are present; ${s.quorum} are needed for a quorum.` },

  stackEmpty: (s) => s.stack.length === 0
    ? { ok: true }
    : { ok: false, reason: 'A question is already pending; only one main motion may be pending at a time.' },

  somethingOnTable: (s) => s.table.length > 0
    ? { ok: true }
    : { ok: false, reason: 'Nothing has been laid on the table.' },

  amendableAndNoFirstDegreePending: (s) => {
    const t = top(s);
    if (!t) return { ok: false, reason: 'No question is pending to amend.' };
    if (!MOTIONS[t.motion]?.amendable) {
      return { ok: false, reason: `${MOTIONS[t.motion].title} is not amendable.` };
    }
    if (s.stack.some(i => i.motion === 'amend')) {
      return { ok: false, reason: 'A first-degree amendment is already pending; the assembly does not consider a third degree of amendment.' };
    }
    return { ok: true };
  },

  topIsFirstDegreeAmendment: (s) => {
    const t = top(s);
    return t && t.motion === 'amend'
      ? { ok: true }
      : { ok: false, reason: 'A first-degree amendment must be the immediately pending question before it can itself be amended.' };
  },

  bareMainMotionPending: (s) => (s.stack.length === 1 && s.stack[0].motion === 'main')
    ? { ok: true }
    : { ok: false, reason: 'In order only when a bare main motion is pending with nothing adhering to it.' },

  outranksTop: (s, tool) => {
    const rank = MOTIONS[tool.motion]?.rank;
    const tr = topRank(s);
    return rank != null && rank > tr
      ? { ok: true }
      : { ok: false, reason: `${MOTIONS[tool.motion].title} does not outrank the immediately pending ${top(s) ? MOTIONS[top(s).motion].title : 'question'}.` };
  },

  debatableMotionPending: (s) => s.stack.some(i => MOTIONS[i.motion]?.debatable)
    ? { ok: true }
    : { ok: false, reason: 'No debatable motion is pending, so there is no debate to close.' }
};

/**
 * The single legality decision. Order matters: phase, then quorum, then guard —
 * so the reason a judge reads is the FIRST thing that made it illegal, not the last.
 */
export function rule(state, toolName) {
  const tool = BY_NAME.get(toolName);
  if (!tool) return { legal: false, ronr: null, reason: `Unknown tool: ${toolName}` };

  const ronr = tool.motion ? MOTIONS[tool.motion].ronr : null;

  if (!tool.phases.includes(state.phase)) {
    return { legal: false, ronr, reason: `Not in order during ${state.phase}.` };
  }

  // §40 — intersects, never adds.
  if (state.present < state.quorum && !SUBQUORUM_ALLOWED.has(toolName)) {
    return {
      legal: false, ronr: '§40',
      reason: `A quorum is absent (${state.present} of ${state.quorum}); only adjournment, points of order, and correcting the record remain in order.`
    };
  }

  if (tool.guard) {
    const g = GUARDS[tool.guard](state, tool);
    if (!g.ok) return { legal: false, ronr, reason: g.reason };
  }

  return { legal: true, ronr, reason: null };
}

/**
 * The legal set. This IS the tool frontier — webmcp.js registers exactly this,
 * and legality.test.js asserts getTools() never diverges from it.
 */
export function legalTools(state) {
  return GATED_TOOLS.filter(t => rule(state, t.toolName).legal).map(t => t.toolName);
}

/** Every gated tool with its verdict — what the "What is in order now" panel renders. */
export function frontier(state) {
  return GATED_TOOLS.map(t => ({ toolName: t.toolName, title: t.title, kind: t.kind, ...rule(state, t.toolName) }));
}
