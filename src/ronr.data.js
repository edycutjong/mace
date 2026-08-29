/**
 * ronr.data.js — the whole rulebook, as data. ZERO LOGIC LIVES HERE.
 *
 * Every legality decision mace makes is a fold over this file. `rule.js` reads it,
 * `webmcp.js` generates 19 tool registrations from it, and `legality.test.js`
 * asserts all 152 cells against it. There is no second source of truth about
 * what is in order.
 *
 * Citations are to Robert's Rules of Order Newly Revised, 12th edition.
 * Rows whose behaviour departs from RONR carry attested: 'simplified' and the
 * UI shows that tag — see SPEC.md "Where mace simplifies".
 */

/** The 7 phases. A meeting is in exactly one at any moment. (complexity.md §2.2) */
export const PHASES = Object.freeze([
  'PRE_MEETING',      // members gathering; no business may be transacted
  'FLOOR_CLEAR',      // in session, stack empty
  'AWAITING_SECOND',  // top of stack stated, not yet seconded (§4)
  'OPEN',             // top of stack is the immediately pending question
  'VOTE_PENDING',     // chair has put the question; only the tally is in order
  'RULING_PENDING',   // a point of order is pending; the chair must rule (§23)
  'ADJOURNED'         // terminal
]);

/**
 * The 12 motion types. `rank` is the RONR order-of-precedence ladder: a motion is
 * in order only if its rank exceeds the rank of the immediately pending motion.
 * That single comparison replaces most of what a naive implementation writes as
 * branching logic. Incidental and bring-back motions carry rank null — they are
 * governed by their own guard instead.
 */
export const MOTIONS = Object.freeze({
  main: {
    id: 'main', title: 'Main motion', ronr: '§10', rank: 1,
    needsSecond: true, debatable: true, amendable: true,
    threshold: 'majority', onAdopt: 'ADOPT_MAIN', attested: 'ronr-12th'
  },
  postpone_indefinitely: {
    id: 'postpone_indefinitely', title: 'Postpone indefinitely', ronr: '§11', rank: 2,
    needsSecond: true, debatable: true, amendable: false,
    threshold: 'majority', onAdopt: 'KILL_MAIN', attested: 'ronr-12th'
  },
  amend: {
    id: 'amend', title: 'Amend (first degree)', ronr: '§12', rank: 3,
    needsSecond: true, debatable: true, amendable: true,
    threshold: 'majority', onAdopt: 'MERGE_AMENDMENT', attested: 'ronr-12th'
  },
  amend_amendment: {
    id: 'amend_amendment', title: 'Amend the amendment (second degree)', ronr: '§12', rank: 3.5,
    needsSecond: true, debatable: true, amendable: false, // no third degree exists
    threshold: 'majority', onAdopt: 'MERGE_AMENDMENT', attested: 'ronr-12th'
  },
  commit: {
    id: 'commit', title: 'Commit / refer to committee', ronr: '§13', rank: 4,
    needsSecond: true, debatable: true, amendable: true,
    threshold: 'majority', onAdopt: 'REFER', attested: 'ronr-12th'
  },
  postpone_to_time: {
    id: 'postpone_to_time', title: 'Postpone to a certain time', ronr: '§14', rank: 5,
    needsSecond: true, debatable: true, amendable: true,
    threshold: 'majority', onAdopt: 'POSTPONE', attested: 'ronr-12th'
  },
  limit_debate: {
    id: 'limit_debate', title: 'Limit or extend limits of debate', ronr: '§15', rank: 6,
    needsSecond: true, debatable: false, amendable: true,
    threshold: 'two_thirds', onAdopt: 'SET_DEBATE_LIMITS', attested: 'ronr-12th'
  },
  previous_question: {
    id: 'previous_question', title: 'Previous question', ronr: '§16', rank: 7,
    needsSecond: true, debatable: false, amendable: false,
    threshold: 'two_thirds', onAdopt: 'CLOSE_DEBATE', attested: 'ronr-12th'
  },
  lay_on_table: {
    id: 'lay_on_table', title: 'Lay on the table', ronr: '§17', rank: 8,
    needsSecond: true, debatable: false, amendable: false,
    threshold: 'majority', onAdopt: 'TABLE_SERIES', attested: 'ronr-12th'
  },
  adjourn: {
    id: 'adjourn', title: 'Adjourn', ronr: '§21', rank: 12,
    needsSecond: true, debatable: false, amendable: false,
    threshold: 'majority', onAdopt: 'ADJOURN', attested: 'simplified',
    // mace requires the pending question to be stated AND seconded before a
    // privileged motion may be stacked on it, so adjourn is not offered in
    // AWAITING_SECOND — "so the minutes never record a motion that was never
    // before the assembly."
    simplification: 'Not offered in AWAITING_SECOND, so the minutes never record a motion that was never before the assembly.'
  },
  point_of_order: {
    id: 'point_of_order', title: 'Point of order', ronr: '§23', rank: null, // incidental
    needsSecond: false, debatable: false, amendable: false,
    threshold: 'chair', onAdopt: 'OPEN_RULING', attested: 'ronr-12th'
  },
  take_from_table: {
    id: 'take_from_table', title: 'Take from the table', ronr: '§34', rank: null, // bring-back
    needsSecond: true, debatable: false, amendable: false,
    threshold: 'majority', onAdopt: 'RESTORE_SERIES', attested: 'ronr-12th'
  }
});

/** The 11 named effects. This file owns the count; every other document takes it from here. */
export const EFFECTS = Object.freeze([
  'ADOPT_MAIN', 'KILL_MAIN', 'MERGE_AMENDMENT', 'REFER', 'POSTPONE',
  'SET_DEBATE_LIMITS', 'CLOSE_DEBATE', 'TABLE_SERIES', 'RESTORE_SERIES',
  'ADJOURN', 'OPEN_RULING'
]);

/** Threshold arithmetic. Abstentions are excluded from both. A tie FAILS. */
export const THRESHOLDS = Object.freeze({
  majority:   (aye, nay) => aye > nay,
  two_thirds: (aye, nay) => aye >= 2 * nay,   // "at least two thirds of the votes cast"
  chair:      () => { throw new Error('chair rulings are not vote-counted; use record_chair_ruling'); }
});

/**
 * The 19 state-gated tools. 7 phases x 19 tools = 133 legality cells.
 *
 * `phases` is the phase dimension of the grid (complexity.md §2.5).
 * `guard` names a stack-shape refinement implemented in rule.js (§2.6) — it can
 * only ever REMOVE legality, never add it.
 *
 * `agentDescription` is written FOR A MODEL: it says what the tool does, when to
 * choose it over its siblings, and — where two readings exist — which one this
 * tool means. The D1 kill test measured these descriptions directly.
 *
 * `paramSchema` is JSON Schema. Every property carries its own `description`,
 * because a described property is the difference between a model guessing and a
 * model knowing. Where the STATE carries the valid values — `move_to_take_from_table`'s
 * `motionId` — the enum is injected at registration time by `webmcp.js`, so the
 * schema itself carries the state. No logic lives in this file to do it.
 */
export const GATED_TOOLS = Object.freeze([
  {
    toolName: 'call_meeting_to_order', motion: null, kind: 'imperative',
    phases: ['PRE_MEETING'], guard: 'quorumPresent',
    title: 'Call the meeting to order',
    agentDescription: 'Opens the meeting so business can be transacted. In order only before the meeting has started and only when enough members are present to meet quorum.',
    paramSchema: {
      type: 'object',
      properties: {
        chair: { type: 'string', description: 'Name of the presiding officer, exactly as it will appear in the minutes.' },
        at: { type: 'string', description: 'The time the gavel fell, raw as spoken — for example "7:04". Do not convert or reformat it.' }
      },
      required: ['chair', 'at']
    }
  },
  {
    toolName: 'move_main_motion', motion: 'main', kind: 'imperative',
    phases: ['FLOOR_CLEAR'], guard: 'stackEmpty',
    title: 'Move a main motion',
    agentDescription: 'Places a new main motion before the assembly when the floor is clear. Use when a member proposes a substantive action the board should decide on. Only one main motion may be pending at a time.',
    paramSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The wording of the motion as moved, quoted verbatim, without renaming or classifying it.' },
        mover: { type: 'string', description: 'Name of the member who moved it.' }
      },
      required: ['text', 'mover']
    }
  },
  {
    toolName: 'second_pending_motion', motion: null, kind: 'imperative',
    phases: ['AWAITING_SECOND'], guard: null,
    title: 'Second the pending motion',
    agentDescription: 'Records a second for the motion that is pending but not yet seconded. After this the motion is open to debate and amendment — unless the motion is undebatable, in which case the chair puts it to a vote at once.',
    paramSchema: {
      type: 'object',
      properties: { seconder: { type: 'string', description: 'Name of the member who seconded.' } },
      required: ['seconder']
    }
  },
  {
    toolName: 'move_to_amend', motion: 'amend', kind: 'imperative',
    phases: ['OPEN'], guard: 'amendableAndNoFirstDegreePending',
    title: 'Move to amend',
    agentDescription: 'Moves to change the wording of the immediately pending motion. In order only while a seconded, amendable motion is open and no first-degree amendment is already pending, because the assembly does not consider a third degree of amendment.',
    paramSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The proposed new wording, or the change requested, in the mover’s own words.' },
        mover: { type: 'string', description: 'Name of the member moving the amendment.' },
        form: { type: 'string', enum: ['insert', 'strike', 'strike_and_insert', 'substitute'], description: 'The form of the amendment. A substitute is treated procedurally as an ordinary first-degree amendment; RONR §12 special handling of amendments to a pending substitute is not implemented.' }
      },
      required: ['text', 'mover', 'form']
    }
  },
  {
    toolName: 'move_to_amend_the_amendment', motion: 'amend_amendment', kind: 'imperative',
    phases: ['OPEN'], guard: 'topIsFirstDegreeAmendment',
    title: 'Move to amend the amendment',
    agentDescription: 'Moves to change the wording of a pending first-degree amendment. In order only when a first-degree amendment is the immediately pending question. There is no third degree of amendment, so this tool does not exist once a second-degree amendment is pending.',
    paramSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The proposed new wording of the amendment.' },
        mover: { type: 'string', description: 'Name of the member moving it.' },
        form: { type: 'string', enum: ['insert', 'strike', 'strike_and_insert', 'substitute'], description: 'The form of the second-degree amendment.' }
      },
      required: ['text', 'mover', 'form']
    }
  },
  {
    toolName: 'move_to_postpone_indefinitely', motion: 'postpone_indefinitely', kind: 'imperative',
    phases: ['OPEN'], guard: 'bareMainMotionPending',
    title: 'Move to postpone indefinitely',
    agentDescription: 'Moves to end consideration of the main motion permanently for this session, without taking a direct vote on it. In order only when a bare main motion is pending with nothing adhering to it. To set a question aside temporarily so it can be resumed later, use move_to_lay_on_table instead.',
    paramSchema: {
      type: 'object',
      properties: { mover: { type: 'string', description: 'Name of the member moving it.' } },
      required: ['mover']
    }
  },
  {
    toolName: 'move_to_commit', motion: 'commit', kind: 'imperative',
    phases: ['OPEN'], guard: 'outranksTop',
    title: 'Move to commit or refer',
    agentDescription: 'Moves to send the pending question to a committee instead of deciding it now. In order only while its rank exceeds the rank of the immediately pending motion.',
    paramSchema: {
      type: 'object',
      properties: {
        committee: { type: 'string', description: 'The committee the question is referred to, named aloud, verbatim.' },
        mover: { type: 'string', description: 'Name of the member moving it.' }
      },
      required: ['committee', 'mover']
    }
  },
  {
    toolName: 'move_to_postpone_to_time', motion: 'postpone_to_time', kind: 'imperative',
    phases: ['OPEN'], guard: 'outranksTop',
    title: 'Move to postpone to a certain time',
    agentDescription: 'Moves to defer the pending question to a stated later time or meeting. Use when the assembly wants to decide the question, but not now. To end consideration entirely, use move_to_postpone_indefinitely.',
    paramSchema: {
      type: 'object',
      properties: {
        until: { type: 'string', description: 'The time or meeting the question is postponed to, as spoken — for example "the next regular meeting". Not a parsed date.' },
        mover: { type: 'string', description: 'Name of the member moving it.' }
      },
      required: ['until', 'mover']
    }
  },
  {
    toolName: 'move_to_limit_debate', motion: 'limit_debate', kind: 'imperative',
    phases: ['OPEN'], guard: 'outranksTop',
    title: 'Move to limit or extend debate',
    agentDescription: 'Moves to change how long debate may run on the pending question. Requires a two-thirds vote because it restricts members rights. Undebatable itself.',
    paramSchema: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'The limit or extension proposed, as spoken — for example "two minutes each".' },
        mover: { type: 'string', description: 'Name of the member moving it.' }
      },
      required: ['limit', 'mover']
    }
  },
  {
    toolName: 'move_previous_question', motion: 'previous_question', kind: 'imperative',
    phases: ['OPEN'], guard: 'debatableMotionPending',
    title: 'Move the previous question',
    agentDescription: 'Moves to close debate immediately and proceed to a vote on the pending question. In order only while at least one debatable motion is pending. Requires a two-thirds vote. This is the formal name for what a member usually says as "call the question" or "cut off debate".',
    paramSchema: {
      type: 'object',
      properties: { mover: { type: 'string', description: 'Name of the member moving it.' } },
      required: ['mover']
    }
  },
  {
    toolName: 'move_to_lay_on_table', motion: 'lay_on_table', kind: 'imperative',
    phases: ['OPEN'], guard: 'outranksTop',
    title: 'Move to lay on the table',
    // The D-a ambiguity target. Positive language, and it names its sibling
    // explicitly, because colloquial "table it" means the opposite of RONR §17.
    agentDescription: 'Sets the pending question aside temporarily so the assembly can take it up again later in this meeting; the motion and its amendments move together and survive. To end consideration of a motion permanently, use move_to_postpone_indefinitely instead.',
    paramSchema: {
      type: 'object',
      properties: { mover: { type: 'string', description: 'Name of the member moving it.' } },
      required: ['mover']
    }
  },
  {
    toolName: 'move_to_take_from_table', motion: 'take_from_table', kind: 'imperative',
    phases: ['FLOOR_CLEAR'], guard: 'somethingOnTable',
    title: 'Move to take from the table',
    agentDescription: 'Brings back a question that was previously laid on the table, together with everything that was adhering to it when it was set aside. In order only when the floor is clear and something is actually on the table.',
    // `motionId` carries `enumFromTable`: webmcp.js regenerates the enum from
    // state.table at every registration, so the agent is offered only motions
    // that are genuinely on the table. The schema itself carries the state —
    // the same thesis as the tool frontier, one level down.
    paramSchema: {
      type: 'object',
      properties: {
        motionId: { type: 'string', enumFromTable: true, description: 'Which tabled question to bring back.' },
        mover: { type: 'string', description: 'Name of the member moving it.' }
      },
      required: ['motionId', 'mover']
    }
  },
  {
    toolName: 'move_to_adjourn', motion: 'adjourn', kind: 'imperative',
    phases: ['FLOOR_CLEAR', 'OPEN'], guard: null,
    title: 'Move to adjourn',
    agentDescription: 'Moves to close the meeting. In order when the floor is clear or while a seconded question is open. Permitted even when a quorum is absent.',
    paramSchema: {
      type: 'object',
      properties: { mover: { type: 'string', description: 'Name of the member moving it.' } },
      required: ['mover']
    }
  },
  {
    toolName: 'raise_point_of_order', motion: 'point_of_order', kind: 'imperative',
    phases: ['FLOOR_CLEAR', 'AWAITING_SECOND', 'OPEN', 'VOTE_PENDING'], guard: null,
    title: 'Raise a point of order',
    // Deliberately carries NO readOnlyHint. That omission is what makes a client
    // confirm with the human before acting — measured in ChatGPT on 2026-08-29.
    agentDescription: 'Raises a point of order, asserting that something out of order has occurred. This does not decide anything: the chair must rule on it. In order only when no other point of order is already awaiting a ruling.',
    paramSchema: {
      type: 'object',
      properties: {
        concern: { type: 'string', description: 'What the member says is out of order, in their own words.' },
        raisedBy: { type: 'string', description: 'Name of the member raising it.' }
      },
      required: ['concern', 'raisedBy']
    }
  },
  {
    toolName: 'record_chair_ruling', motion: null, kind: 'imperative',
    phases: ['FLOOR_CLEAR', 'AWAITING_SECOND', 'OPEN', 'VOTE_PENDING', 'RULING_PENDING'], guard: null,
    title: "Record the chair's ruling",
    // Registered OUTSIDE RULING_PENDING on purpose, so the chair can rule on
    // germaneness (§12) or a lapsed second (§4) without a member first raising a
    // point of order. Germaneness is the one judgement mace refuses to make, so
    // the tool that carries it must be reachable whenever the chair needs it.
    agentDescription: 'Writes down the ruling the chair has already given out loud. Only the human chair decides a ruling; this tool records a decision a person has made, it does not make one. There is no "not germane" verdict: a sustained germaneness point is ruling "well_taken" with disposition "strike_pending_motion".',
    paramSchema: {
      type: 'object',
      properties: {
        ruledBy: { type: 'string', description: "The chair's name, exactly as it will appear in the minutes." },
        ruling: { type: 'string', enum: ['well_taken', 'not_well_taken', 'lapsed_for_want_of_second'], description: 'The chair ruling as spoken.' },
        disposition: { type: 'string', enum: ['strike_pending_motion', 'none'], description: 'Whether the ruling removes the immediately pending motion from the stack. A motion that lapses for want of a second is by definition removed.' },
        rationale: { type: 'string', description: "The chair's stated reason, in the chair's own words." }
      },
      required: ['ruledBy', 'ruling', 'disposition', 'rationale']
    }
  },
  {
    toolName: 'correct_last_entry', motion: null, kind: 'imperative',
    phases: ['FLOOR_CLEAR', 'AWAITING_SECOND', 'OPEN', 'VOTE_PENDING', 'RULING_PENDING', 'ADJOURNED'], guard: null,
    title: 'Correct the last minute-book entry',
    agentDescription: 'Appends a correction to the minute book. Corrections are appended, never overwritten, so the record shows both what was first written and what it was corrected to — which is how real minutes work.',
    paramSchema: {
      type: 'object',
      properties: {
        correction: { type: 'string', description: 'What the entry should say instead.' },
        actor: { type: 'string', description: 'Who is making the correction.' }
      },
      required: ['correction', 'actor']
    }
  },
  {
    toolName: 'set_members_present', motion: null, kind: 'imperative',
    phases: ['PRE_MEETING', 'FLOOR_CLEAR', 'AWAITING_SECOND', 'OPEN', 'VOTE_PENDING', 'RULING_PENDING'], guard: null,
    title: 'Set the number of members present',
    // R5/R10: this is REAL user input from the bench, never a debug toggle.
    // The chair genuinely counts the room, in the same class as a chair ruling.
    agentDescription: 'Records how many members are currently in the room, as counted by the chair. If this falls below quorum, almost every motion stops being in order until it is restored.',
    paramSchema: {
      type: 'object',
      properties: {
        present: { type: 'integer', minimum: 0, description: 'Number of members now in the room.' },
        note: { type: 'string', description: 'Who arrived or left, in the clerk’s own words — for example "Boyd, Raman and Nakamura left for the school-board meeting". Recorded in the minutes verbatim, never parsed.' }
      },
      required: ['present']
    }
  },
  {
    toolName: 'record_vote_tally', motion: null, kind: 'declarative',
    phases: ['VOTE_PENDING'], guard: null,
    title: 'Record the vote tally',
    agentDescription: 'Records the counted result of the vote the chair has just taken on the pending question, applies the threshold that motion requires, and returns whether it was adopted or lost. In order only once the chair has put the question.',
    paramSchema: {
      type: 'object',
      properties: {
        aye: { type: 'integer', minimum: 0, description: 'The number of members voting in the affirmative, as counted in the room.' },
        nay: { type: 'integer', minimum: 0, description: 'The number of members voting in the negative, as counted in the room.' },
        abstain: { type: 'integer', minimum: 0, description: 'The number of members present who declined to vote. Abstentions are recorded in the minutes but excluded from the threshold arithmetic.' }
      },
      required: ['aye', 'nay']
    }
  },
  {
    toolName: 'enter_motion_text', motion: null, kind: 'declarative',
    phases: ['FLOOR_CLEAR', 'OPEN'], guard: null,
    title: 'Enter motion text',
    // No toolautosubmit, deliberately: the tool fills and focuses the form, and a
    // HUMAN clicks "State the question". The human-in-the-loop argument, in HTML.
    agentDescription: "Puts the wording of a motion into the clerk's entry field and focuses it, ready for a person to state the question to the assembly. Use this to transcribe a motion exactly as it was spoken. This does not place the motion before the assembly — a human must click to do that.",
    paramSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The exact words of the motion as spoken, quoted verbatim, without renaming or classifying it.' },
        mover: { type: 'string', description: 'The name of the member who made the motion, as the clerk heard it.' }
      },
      required: ['text']
    }
  }
]);

/**
 * §40 — what remains in order when a quorum is absent.
 *
 * SEVEN names, not five. The two extra are procedural MACHINERY: an adjournment
 * that cannot be seconded, or that cannot be tallied, is a deadlock — the seeded
 * meeting hangs at seq 30-32 without them (seed-data.md §0 correction C5).
 *
 * This set INTERSECTS the phase grid, it never adds to it:
 *   legal(state) = legal(phase, stack) ∩ (present >= quorum ? ALL : SUBQUORUM_ALLOWED)
 */
export const SUBQUORUM_ALLOWED = Object.freeze(new Set([
  'move_to_adjourn',        // §40 permits adjourning without a quorum
  'second_pending_motion',  // machinery: an adjournment that cannot be seconded is a deadlock
  'record_vote_tally',      // machinery: an adjournment that cannot be tallied is a deadlock
  'raise_point_of_order',   // §40 — that a quorum is absent must always be raisable
  'record_chair_ruling',    // the chair must be able to rule on it
  'correct_last_entry',     // correcting the record is not transacting business
  'set_members_present'     // §40 "take measures to obtain a quorum" — labelled simplified
]));

/**
 * The 4 always-on reads, registered in every phase, owned by `sessionCtl` and
 * never touched by the registration diff. 19 gated + 4 = 23 tools.
 *
 * `untrustedContentHint` is set on exactly TWO of them and deliberately omitted
 * on the other two, with the reason next to each. The contrast is the artifact:
 * blanket-annotating everything says nothing. `annotations.test.js` asserts, for
 * every tool declaring untrustedContentHint false, that its output against the
 * poisoned seed contains no substring of any member-authored text — which turns
 * the annotation into a checked contract rather than a decoration.
 */
export const ALWAYS_ON_READS = Object.freeze([
  {
    toolName: 'get_motion_stack',
    title: 'Get the motion stack',
    agentDescription: 'Reports every question currently before the assembly, innermost last: what is immediately pending, what it adheres to, who moved and seconded each, and the RONR citation for each. Call this first when you are unsure what is going on.',
    untrusted: true,
    untrustedReason: 'Returns text fields typed by the clerk quoting members. Third-party content flowing back to the model.',
    paramSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    toolName: 'draft_minutes',
    title: 'Draft the minutes',
    agentDescription: 'Produces the minute book as it currently stands: every event in order, with movers, seconders, chair rulings and vote tallies. Corrections appear as appended corrections, never as edits.',
    untrusted: true,
    untrustedReason: 'Embeds verbatim motion text and chair-ruling rationales.',
    paramSchema: {
      type: 'object',
      properties: {
        through: { type: 'string', description: "The point in the meeting to draft up to, in the clerk's own words, e.g. 'through the parking motion'. Omit for the whole meeting so far." }
      },
      required: []
    }
  },
  {
    toolName: 'explain_current_state',
    title: 'Explain the current state',
    agentDescription: 'Explains the procedural situation: which phase the meeting is in, how deep the stack is, whether a quorum is present, and what class of act is therefore in order. Describes procedure only — it never quotes what any member said.',
    untrusted: false,
    untrustedReason: 'Returns procedural description only: motion classes, phase, RONR citations. Never member-authored text. Asserted by annotations.test.js against the poisoned seed.',
    paramSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    toolName: 'explain_path_to',
    title: 'Explain the path to a goal',
    agentDescription: 'Searches for a lawful sequence of motions that reaches a procedural goal from where the meeting actually stands, and returns it as a conditional plan that branches on how each vote goes. This is a real search and may take a moment; it can be stopped, and stopping it returns the best plan proved so far rather than nothing.',
    untrusted: false,
    untrustedReason: 'Returns motion ids and step names only. Never quoted text. Asserted by annotations.test.js against the poisoned seed.',
    paramSchema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          enum: ['vote_on_the_main_motion', 'dispose_of_pending_amendments', 'return_to_a_tabled_motion', 'end_debate_now', 'adjourn_cleanly'],
          description: 'The procedural outcome the assembly wants to reach.'
        }
      },
      required: ['goal']
    }
  }
]);

/** Motions explicitly out of scope, with the reason. Rendered verbatim in SPEC.md. */
export const OUT_OF_SCOPE = Object.freeze([
  { motion: 'Reconsider', ronr: '§37', reason: 'Eligibility is restricted to a member who voted on the prevailing side. mace records vote tallies, not per-member votes, so the eligibility rule could not be enforced. Implementing it would mean shipping a rule mace cannot check.' },
  { motion: 'Rescind / Amend Something Previously Adopted', ronr: '§35', reason: 'Requires a previous-meeting record; mace models one meeting.' },
  { motion: 'Discharge a Committee', ronr: '§36', reason: 'Requires committee state; commit is modelled as terminal disposal.' },
  { motion: 'Appeal', ronr: '§24', reason: 'Duplicates the human-authority beat of point-of-order plus chair ruling.' },
  { motion: 'Division of the Assembly', ronr: '§29', reason: 'Has no referent here: a division converts a voice vote into a counted one, and every mace vote is already a counted tally.' },
  { motion: 'Germaneness of an amendment', ronr: '§12', reason: 'Not computable from a table. mace never rules on germaneness — the chair does, via record_chair_ruling, and the ruling enters the minutes. This limitation is the philosophical core of the product, not a gap.' }
]);
