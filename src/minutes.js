/**
 * minutes.js — the minute book, rendered from the append-only log.
 *
 * Corrections are APPENDED, never applied over the entry they correct, so the
 * record shows both what was first written and what it was corrected to. That is
 * how real minutes work; the data structure and the domain agree.
 *
 * This module is the reason `draft_minutes` carries untrustedContentHint: true.
 * It embeds verbatim motion text and chair-ruling rationales — member-authored
 * content flowing back to the model.
 */

import { MOTIONS } from './ronr.data.js';

const nameOf = (m) => MOTIONS[m]?.title ?? m;

/** One log line, in minute-book prose. */
function line(ev, i) {
  const { type, payload = {}, at, actor } = ev;
  const t = at ? `${at} · ` : '';
  switch (type) {
    case 'call_meeting_to_order':
      return `${t}The meeting was called to order by ${payload.chair} at ${payload.at}.`;
    case 'set_members_present':
      return `${t}The chair counted ${payload.present} members present.${payload.note ? ` ${payload.note}` : ''}`;
    case 'move_main_motion':
      return `${t}${payload.mover} moved: "${payload.text}"`;
    case 'second_pending_motion':
      return `${t}Seconded by ${payload.seconder}.`;
    case 'move_to_amend':
      return `${t}${payload.mover} moved to amend (${payload.form ?? 'amend'}, §12): "${payload.text}"`;
    case 'move_to_amend_the_amendment':
      return `${t}${payload.mover} moved to amend the amendment (second degree, §12): "${payload.text}"`;
    case 'move_to_commit':
      return `${t}${payload.mover} moved to refer the question to ${payload.committee} (§13).`;
    case 'move_to_postpone_to_time':
      return `${t}${payload.mover} moved to postpone the question to ${payload.until} (§14).`;
    case 'move_to_limit_debate':
      return `${t}${payload.mover} moved to limit debate: ${payload.limit} (§15).`;
    case 'move_to_postpone_indefinitely':
      return `${t}${payload.mover} moved to postpone the question indefinitely (§11).`;
    case 'move_previous_question':
      return `${t}${payload.mover} moved the previous question (§16).`;
    case 'move_to_lay_on_table':
      return `${t}${payload.mover} moved to lay the question on the table (§17).`;
    case 'move_to_take_from_table':
      return `${t}${payload.mover} moved to take the question from the table (§34).`;
    case 'move_to_adjourn':
      return `${t}${payload.mover} moved to adjourn (§21).`;
    case 'put_the_question':
      return `${t}The chair put the question.`;
    case 'record_vote_tally': {
      const r = ev.result;
      return `${t}The vote was taken. Ayes ${payload.aye}, Noes ${payload.nay}, Abstaining ${payload.abstain ?? 0}.` +
             (r ? ` ${r}` : '');
    }
    case 'raise_point_of_order':
      return `${t}${payload.raisedBy} raised a point of order (§23): "${payload.concern}"`;
    case 'record_chair_ruling':
      return `${t}The chair (${payload.ruledBy}) ruled the point ${payload.ruling.replace(/_/g, ' ')}: "${payload.rationale}"` +
             (payload.disposition === 'strike_pending_motion' ? ' The pending motion was struck from the stack.' : '');
    case 'correct_last_entry':
      return `${t}CORRECTION, entered by ${payload.actor}: "${payload.correction}" (appended; the entry above stands as first written.)`;
    case 'enter_motion_text':
      return null;   // the entry field was filled; nothing was placed before the assembly
    default:
      return `${t}${type}`;
  }
}

/**
 * Draft the minute book. `through` is the clerk's own words for where to stop —
 * it is matched loosely against the text of the log because a clerk says "through
 * the parking motion", not "through seq 17".
 */
export function draftMinutes(events, state, through) {
  let use = events;
  if (through) {
    const needle = String(through).toLowerCase();
    const cut = events.findIndex(e => JSON.stringify(e.payload ?? {}).toLowerCase().includes(needle));
    if (cut >= 0) use = events.slice(0, cut + 1);
  }

  const body = use.map(line).filter(Boolean).map((l, i) => `${String(i + 1).padStart(2, ' ')}. ${l}`);

  const head = [
    'MINUTES — Maple Ridge Homeowners Association, Board of Directors',
    `Parliamentary authority: Robert's Rules of Order Newly Revised, 12th ed.`,
    `Board of 9; a quorum is 5. Members present at this point: ${state.present}.`,
    state.chair ? `Presiding: ${state.chair}.` : 'The meeting has not been called to order.',
    ''
  ];

  const pending = state.stack.length
    ? ['', 'STILL PENDING AT THIS POINT:',
       ...state.stack.map((it, i) => `   ${'  '.repeat(i)}${i === state.stack.length - 1 ? '▸' : ' '} ${nameOf(it.motion)} — "${it.text}"${it.seconder ? '' : ' (awaiting a second)'}`)]
    : ['', 'Nothing is pending; the floor is clear.'];

  const tabled = state.table.length
    ? ['', 'ON THE TABLE:', ...state.table.map(t => `   ${t.id} — ${nameOf(t.series[0]?.motion)}: "${t.series[0]?.text}"`)]
    : [];

  return [...head, ...body, ...pending, ...tabled].join('\n');
}

/**
 * A purely PROCEDURAL description. This is the function that lets
 * `explain_current_state` carry untrustedContentHint: false honestly — it names
 * motion classes, phases and citations and never quotes a member. If someone
 * later interpolates motion text here, annotations.test.js goes red.
 */
export function explainState(state, legalCount) {
  const t = state.stack[state.stack.length - 1];
  const quorum = state.present >= state.quorum;
  const parts = [
    `Phase: ${state.phase}.`,
    `The stack is ${state.stack.length} deep.`,
    t ? `The immediately pending question is a ${nameOf(t.motion).toLowerCase()} (${MOTIONS[t.motion]?.ronr}), ${t.seconder ? 'seconded' : 'not yet seconded'}.`
      : 'Nothing is immediately pending.',
    `${state.present} of 9 members are present; a quorum is ${state.quorum}, so a quorum is ${quorum ? 'present' : 'ABSENT'}.`,
    !quorum ? 'While a quorum is absent, only adjournment, points of order, correcting the record and measures to obtain a quorum are in order (§40).' : '',
    state.table.length ? `${state.table.length} question(s) are on the table and may be taken up when the floor is clear (§34).` : '',
    `${legalCount} acts are in order right now.`
  ];
  return parts.filter(Boolean).join(' ');
}
