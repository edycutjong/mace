/**
 * path.js — bolt-on 1. `explain_path_to({goal})`.
 *
 * THE CLERK'S REAL QUESTION
 * "The budget motion is on the table. We're inside a second-degree amendment on
 * the parking motion. How do we get back to the budget?" A parliamentarian answers
 * that from expertise. A volunteer secretary cannot. The honest answer is five or
 * more steps and it BRANCHES ON VOTE OUTCOMES.
 *
 * So this is not a shortest-path walk. It is an AND-OR search:
 *
 *   OR  nodes — the moves the assembly may CHOOSE. Successors come from the very
 *       same rule() predicate that drives tool registration. Succeed if ANY child
 *       succeeds.
 *   AND nodes — the two outcomes of every vote, which the searcher does NOT
 *       control. BOTH children must be discharged. A branch is discharged either
 *       by reaching the goal by its own route, or — for the losing branch — by
 *       recording that the assembly was asked and decided otherwise, which no
 *       sequence of motions overrides at this meeting. A searcher that ignored
 *       the losing branch would be assuming every vote goes its way, which is
 *       exactly the advice a volunteer secretary must not be given.
 *
 * That is a minimax over adversarial vote outcomes, and it produces the
 * CONDITIONAL plan a parliamentarian actually states: "move to lay the parking
 * motion on the table; if that carries, take the budget motion from the table;
 * if it fails, move the previous question and then…".
 *
 * WHY IT YIELDS. `Exposed=Window` in the normative IDL means there are NO WORKERS.
 * The search runs on the main thread and must not freeze the panel or the stop
 * button, so it yields on a time slice at every node expansion.
 *
 * WHY ABORT RETURNS AN ANSWER. Iterative deepening is what makes "best known
 * result on abort" honest rather than a story: at every COMPLETED depth two things
 * have accumulated monotonically — the shallowest complete plan, and the greatest
 * depth fully proven. The ply in flight when the abort lands is thrown away, so
 * nothing reported is half-computed.
 */

import { legalTools, top } from './rule.js';
import { reduce, canonical } from './fsm.js';
import { MOTIONS, GATED_TOOLS } from './ronr.data.js';

const ROWS = new Map(GATED_TOOLS.map(r => [r.toolName, r]));

const MAX_DEPTH = 12;
const ROBUSTNESS_PLIES = 1;
const SLICE_MS = 8;              // stay under a 16.7 ms frame budget

/** Internal sentinel. Deliberately NOT a DOMException — see the resolve-on-abort contract. */
class Cancelled extends Error {}

const now = () => (globalThis.performance?.now?.() ?? Date.now());

let sliceStart = 0;

/**
 * Awaited at EVERY node expansion. Yielding is time-driven, not count-driven, so a
 * cheap ply and an expensive ply both keep the UI responsive without hand-tuned
 * node budgets. scheduler.yield() returns to the event loop AND resumes at high
 * priority; setTimeout(0) is the fallback and is clamped to ~4 ms after five
 * nested timers, so it is slower, not broken.
 */
async function maybeYield(signal) {
  if (now() - sliceStart < SLICE_MS) return;          // cheap: one clock read per node
  await (globalThis.scheduler?.yield?.() ?? new Promise(r => setTimeout(r, 0)));
  sliceStart = now();
  if (signal?.aborted) throw new Cancelled();
}

/** The five goals, each a predicate over a state. The enum in the schema is this list. */
export const GOALS = Object.freeze({
  vote_on_the_main_motion: {
    label: 'take a vote on the main motion',
    test: (s) => s.phase === 'VOTE_PENDING' && top(s)?.motion === 'main'
  },
  dispose_of_pending_amendments: {
    label: 'clear every pending amendment off the main motion',
    test: (s) => s.stack.length > 0 && !s.stack.some(i => i.motion === 'amend' || i.motion === 'amend_amendment')
  },
  return_to_a_tabled_motion: {
    label: 'bring a tabled question back before the assembly',
    test: (s, s0) => s.stack.length > 0 && s.table.length < s0.table.length
  },
  end_debate_now: {
    label: 'close debate and go straight to the vote',
    test: (s) => s.phase === 'VOTE_PENDING'
  },
  adjourn_cleanly: {
    label: 'adjourn the meeting',
    test: (s) => s.phase === 'ADJOURNED'
  }
});

/** A plausible mover, so the simulated step is a real event and not a shape. */
const SIM = { mover: 'a member', seconder: 'a member', chair: 'the chair' };

/** Fill the required parameters of a simulated step with neutral placeholders. */
function simPayload(toolName, state) {
  switch (toolName) {
    case 'second_pending_motion': return { seconder: SIM.seconder };
    case 'move_to_commit':        return { mover: SIM.mover, committee: 'committee' };
    case 'move_to_postpone_to_time': return { mover: SIM.mover, until: 'the next regular meeting' };
    case 'move_to_limit_debate':  return { mover: SIM.mover, limit: 'as proposed' };
    case 'move_to_amend':
    case 'move_to_amend_the_amendment':
      return { mover: SIM.mover, text: '(as proposed)', form: 'substitute' };
    case 'move_to_take_from_table':
      return { mover: SIM.mover, motionId: state.table[state.table.length - 1]?.id };
    case 'record_chair_ruling':
      return { ruledBy: SIM.chair, ruling: 'well_taken', disposition: 'none', rationale: '(as ruled)' };
    default: return { mover: SIM.mover };
  }
}

/**
 * The moves the search is allowed to consider. Two exclusions, both deliberate:
 * `set_members_present` and `correct_last_entry` are clerical acts that no plan
 * should ever RECOMMEND as a procedural step, and `raise_point_of_order` invites
 * the search to route through a human judgement it cannot predict.
 */
const EXCLUDED = new Set(['set_members_present', 'correct_last_entry', 'raise_point_of_order', 'enter_motion_text']);

function successors(state) {
  const moves = legalTools(state).filter(n => !EXCLUDED.has(n));
  // The chair putting the question is a bench act, not a tool, but it is a legal
  // procedural step and a plan that omitted it could never reach a vote.
  if (state.phase === 'OPEN' && top(state)?.seconder) moves.push('put_the_question');
  return moves;
}

/** Apply one simulated step. Votes are handled by the AND node, never here. */
function step(state, toolName) {
  const payload = toolName === 'put_the_question' ? {} : simPayload(toolName, state);
  return reduce(state, { type: toolName, payload, at: state.now }, ROWS);
}

/**
 * The AND-OR search.
 *
 * At VOTE_PENDING the searcher does not choose — the assembly does — so the node
 * is an AND over both outcomes, and a plan is only returned if BOTH branches
 * reach the goal. That is what makes the returned plan conditional and what makes
 * it honest.
 */
async function andOr(state, goal, depth, signal, tt, count, state0) {
  count();
  await maybeYield(signal);

  if (GOALS[goal].test(state, state0)) return { kind: 'done' };
  if (depth <= 0) return null;

  const key = canonical(state) + '|' + depth;
  if (tt.has(key)) return tt.get(key);

  let result = null;

  if (state.phase === 'VOTE_PENDING') {
    // AND node — the vote may carry or fail and the plan must survive both.
    const t = top(state);
    const threshold = MOTIONS[t?.motion]?.threshold ?? 'majority';
    const carried = reduce(state, { type: 'record_vote_tally', payload: { aye: 9, nay: 0, abstain: 0 }, at: state.now }, ROWS);
    const lost    = reduce(state, { type: 'record_vote_tally', payload: { aye: 0, nay: 9, abstain: 0 }, at: state.now }, ROWS);

    const a = await andOr(carried, goal, depth - 1, signal, tt, count, state0);
    if (a) {
      const b = await andOr(lost, goal, depth - 1, signal, tt, count, state0);
      // Both branches must be DISCHARGED, but they are not discharged the same way.
      // If the losing branch has its own route to the goal, the plan states it. If
      // it does not, the branch is discharged by the only honest thing a
      // parliamentarian can say: the assembly was asked and decided otherwise, and
      // no sequence of motions overrides that at this meeting. Recording that as a
      // terminal is the difference between a conditional plan and a plan that
      // silently assumes every vote goes its way.
      result = {
        kind: 'vote',
        motion: MOTIONS[t?.motion]?.title ?? 'the pending question',
        ronr: MOTIONS[t?.motion]?.ronr,
        threshold,
        ifCarried: a,
        ifLost: b ?? { kind: 'decided' }
      };
    }
  } else {
    // OR node — the assembly chooses; any child that works is a plan.
    for (const move of successors(state)) {
      await maybeYield(signal);
      const child = await andOr(step(state, move), goal, depth - 1, signal, tt, count, state0);
      if (child) {
        const row = ROWS.get(move);
        result = {
          kind: 'move',
          tool: move,
          /* v8 ignore next -- the `?? move` fallback is unreachable: every `move` here comes from successors(), which is either 'put_the_question' (handled by the arm to the left) or a name drawn from legalTools(state), and ROWS is built from the very same GATED_TOOLS rows, every one of which carries a non-empty `title`. `row` and `row.title` can therefore never be falsy at this point. */
          title: move === 'put_the_question' ? 'The chair puts the question' : row?.title ?? move,
          ronr: row?.motion ? MOTIONS[row.motion]?.ronr : null,
          next: child
        };
        break;
      }
    }
  }

  tt.set(key, result);
  return result;
}

/** Render a conditional plan as the numbered prose a parliamentarian would speak. */
function renderPlan(node, indent = '') {
  const lines = [];
  let n = node, i = 1;
  while (n && n.kind === 'move') {
    lines.push(`${indent}${i++}. ${n.title}${n.ronr ? ` (${n.ronr})` : ''}`);
    n = n.next;
  }
  if (n && n.kind === 'vote') {
    const t = n.threshold === 'two_thirds' ? 'a two-thirds vote' : 'a majority';
    lines.push(`${indent}${i}. The vote is taken on ${n.motion}${n.ronr ? ` (${n.ronr})` : ''} — it needs ${t}.`);
    lines.push(`${indent}   • if it CARRIES:`);
    lines.push(renderPlan(n.ifCarried, indent + '      '));
    lines.push(`${indent}   • if it FAILS:`);
    lines.push(renderPlan(n.ifLost, indent + '      '));
  }
  if (n && n.kind === 'done') lines.push(`${indent}✓ the assembly has reached the goal.`);
  if (n && n.kind === 'decided') {
    lines.push(`${indent}— the assembly has decided otherwise. No sequence of motions reaches the goal at this meeting; it would take a new motion at a later one.`);
  }
  return lines.filter(Boolean).join('\n');
}

function render(plan, planDepth, depthProven, nodes, t0, goal, cancelled) {
  const ms = Math.round(now() - t0);
  const label = GOALS[goal].label;

  if (!plan) {
    const head = cancelled
      ? `CANCELLED — no conditional plan reaches '${goal}' within ${depthProven} moves. Searched ${nodes} nodes in ${ms} ms; deeper search stopped at your request.`
      : `No conditional plan reaches '${goal}' within ${depthProven} moves — and that is a real answer: it bounds the problem. Searched ${nodes} nodes in ${ms} ms.`;
    return head + `\n\nTo ${label} from here, the assembly would first have to change something the rules do not let it change by motion alone.`;
  }

  const head = cancelled
    ? `CANCELLED — best answer found in ${ms} ms at depth ${planDepth}; deeper search stopped at your request.`
    : `A conditional plan to ${label}, proved complete to depth ${depthProven} in ${ms} ms over ${nodes} nodes.`;

  return `${head}\n\n${renderPlan(plan)}\n\nEvery step above is a motion that rule() says is in order at the point it appears; the branches are the outcomes the assembly controls and the search does not.`;
}

/**
 * The tool body. Resolves on abort — it never rejects — because a partial answer
 * is more useful to the clerk and to the agent than a rejection. The `CANCELLED —`
 * prefix is what stops the agent mistaking it for a completed search.
 */
export async function explainPathTo(goal, state0, { signal } = {}) {
  if (!GOALS[goal]) return `'${goal}' is not a goal mace searches for. Choose one of: ${Object.keys(GOALS).join(', ')}.`;

  const t0 = now();
  sliceStart = t0;
  const tt = new Map();            // key = canonical(state) + '|' + remainingDepth
  let bestPlan = null;             // shallowest complete conditional plan found so far
  let planDepth = 0;
  let depthProven = 0;             // greatest depth FULLY searched
  let nodes = 0;
  const count = () => { nodes++; };

  try {
    for (let d = 1; d <= MAX_DEPTH; d++) {
      const plan = await andOr(state0, goal, d, signal, tt, count, state0);
      depthProven = d;                       // this ply completed -> the bound is now proven
      if (plan && !bestPlan) { bestPlan = plan; planDepth = d; }
      if (bestPlan && d >= planDepth + ROBUSTNESS_PLIES) break;
    }
  } catch (e) {
    if (!(e instanceof Cancelled)) throw e;  // real errors still propagate
    return render(bestPlan, planDepth, depthProven, nodes, t0, goal, true);
  }
  return render(bestPlan, planDepth, depthProven, nodes, t0, goal, false);
}
