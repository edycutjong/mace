/**
 * rule-extra.test.js — closes the coverage gaps legality.test.js deliberately
 * leaves open. legality.test.js asserts the 152-cell grid; this file targets
 * the handful of branches that grid can't reach because they sit outside the
 * phase x tool matrix: the unknown-tool guard, frontier(), and a few defensive
 * branches inside the guard predicates themselves.
 *
 * Several cases here construct states that the live reducer (fsm.js) would
 * never actually produce (e.g. phase OPEN with an empty stack, or a rank-null
 * motion sitting where only ranked motions appear in practice). rule() is a
 * pure function of (state, toolName) with no knowledge of how a state was
 * built, so exercising its full input domain — not just the reducer-reachable
 * subset — is a legitimate way to prove its own branches, and is called out
 * explicitly wherever it's done.
 */

import { describe, it, expect } from 'vitest';
import { rule, legalTools, frontier, top } from '../src/rule.js';
import { GATED_TOOLS } from '../src/ronr.data.js';

const BASE = { phase: 'OPEN', stack: [], table: [], present: 7, quorum: 5, ruling: null, disposed: [] };

describe('rule() — unknown tool name', () => {
  it('returns legal:false with no RONR citation for a name not in GATED_TOOLS', () => {
    const got = rule(BASE, 'not_a_real_tool');
    expect(got.legal).toBe(false);
    expect(got.ronr).toBeNull();
    expect(got.reason).toBe('Unknown tool: not_a_real_tool');
  });
});

describe('top() — the exported helper directly', () => {
  it('returns null on an empty stack', () => {
    expect(top({ stack: [] })).toBeNull();
  });

  it('returns the last item on a non-empty stack', () => {
    const item = { id: 'm1', motion: 'main' };
    expect(top({ stack: [item] })).toBe(item);
  });
});

describe('frontier() — every gated tool with its verdict', () => {
  it('returns exactly one row per gated tool, each carrying the rule() verdict', () => {
    const state = { ...BASE, stack: [{ id: 'm1', motion: 'main', text: 'x', mover: 'D', seconder: 'M' }] };
    const rows = frontier(state);
    expect(rows).toHaveLength(GATED_TOOLS.length);
    expect(rows.map(r => r.toolName).sort()).toEqual(GATED_TOOLS.map(t => t.toolName).sort());
    for (const row of rows) {
      const direct = rule(state, row.toolName);
      expect(row.legal).toBe(direct.legal);
      expect(row.reason).toBe(direct.reason);
      expect(row.ronr).toBe(direct.ronr);
      expect(row).toHaveProperty('title');
      expect(row).toHaveProperty('kind');
    }
  });

  it('agrees with legalTools() on which names are legal', () => {
    const state = { ...BASE, phase: 'FLOOR_CLEAR', stack: [] };
    const legalFromFrontier = frontier(state).filter(r => r.legal).map(r => r.toolName).sort();
    expect(legalFromFrontier).toEqual(legalTools(state).sort());
  });
});

describe('amendableAndNoFirstDegreePending — "no question is pending to amend"', () => {
  it('refuses move_to_amend when nothing is on the stack at all', () => {
    // OPEN with an empty stack is not a state the reducer ever produces (OPEN
    // means something is immediately pending) — this exercises the guard's
    // own defensive branch for that shape directly.
    const got = rule({ ...BASE, stack: [] }, 'move_to_amend');
    expect(got.legal).toBe(false);
    expect(got.reason).toBe('No question is pending to amend.');
  });
});

describe('outranksTop — topRank() against an empty and a rank-null stack', () => {
  const lay = 'move_to_lay_on_table'; // rank 8, guard 'outranksTop'

  it('treats an empty stack as rank 0 (topRank\'s own "!t" branch)', () => {
    // Every real gated-tool rank is >= 4, so an empty stack (rank 0) can never
    // itself produce a refusal here — this proves topRank's null-stack path
    // executes and yields the outrank-everything result, not that it refuses.
    const got = rule({ ...BASE, stack: [] }, lay);
    expect(got.legal).toBe(true);
  });

  it('treats a rank-null top motion (e.g. take_from_table) as rank 0, same as empty', () => {
    // take_from_table briefly occupies the stack in AWAITING_SECOND/VOTE_PENDING
    // in the live app (§34, undebatable — T5b skips OPEN entirely), so this
    // exact combination — it sitting there during OPEN — is not reducer-
    // reachable. It is still a value the guard's own rank lookup must handle,
    // since MOTIONS.take_from_table.rank is null by data, not by accident.
    const stack = [{ id: 't1', motion: 'take_from_table', text: 'x', mover: 'D', seconder: 'M' }];
    const got = rule({ ...BASE, stack }, lay);
    expect(got.legal).toBe(true);
  });
});

describe('quorumPresent guard — proven unreachable, not untested', () => {
  it('the §40 sub-quorum check always intercepts call_meeting_to_order first', () => {
    // call_meeting_to_order is the guard's only user and is NOT in
    // SUBQUORUM_ALLOWED, so rule()'s §40 check (which runs before any guard)
    // already returns for present < quorum. GUARDS.quorumPresent's own false
    // branch can therefore never execute through rule() — proven here by
    // checking the reason cites §40, not the guard's own wording, exactly
    // when the guard would otherwise have fired.
    const got = rule({ ...BASE, phase: 'PRE_MEETING', present: 3, quorum: 5 }, 'call_meeting_to_order');
    expect(got.legal).toBe(false);
    expect(got.ronr).toBe('§40');
  });
});
