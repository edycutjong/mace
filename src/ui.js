/**
 * ui.js — the clerk's bench, and the panel that IS the toolchange listener.
 *
 * "What is in order now" is the PRIMARY UI ELEMENT of this product, not a debug
 * affordance and never an inspector. Its left column is rendered from
 * `document.modelContext.getTools()` — the API's own return value, not our
 * bookkeeping — and its right column is rendered from rule(), each row citing the
 * rule that blocks it. Putting the invisible mechanism on screen as the product's
 * main surface is the whole design.
 */

import {
  hasWebMCP, contextSource, modelContext, ledger, reg, onChange, getState, getEvents,
  commit, runTool, outOfOrder, replayLog, start
} from './webmcp.js';
import { legalTools } from './rule.js';
import { MOTIONS, GATED_TOOLS, ALWAYS_ON_READS } from './ronr.data.js';
import { draftMinutes } from './minutes.js';
import { SEED, CHECKPOINTS, MEMBERS } from './seed.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const ROWS = new Map([...GATED_TOOLS, ...ALWAYS_ON_READS].map(r => [r.toolName, r]));
const ronrFor = (name) => {
  const row = ROWS.get(name);
  return row?.motion ? MOTIONS[row.motion]?.ronr : null;
};

let pathCtl = null;   // the EXECUTION signal for a running explain_path_to

/**
 * Renders of the left column are ASYNC (getTools() is a promise) and are triggered
 * from three places at once — commit()'s emit, the deferred syncRegistration's
 * emit, and the toolchange listener. Clearing the host BEFORE the await let two
 * in-flight renders each clear and then each append, so the panel showed the tool
 * list two to ten times over while the count badge showed it once. Nothing may
 * touch the DOM until getTools() has answered, and a render that has been
 * superseded while awaiting must drop its result on the floor.
 */
let renderSeq = 0;

// ── left column: the API's own answer ───────────────────────────────────────
async function renderInOrder() {
  const token = ++renderSeq;

  let names, annotations = new Map();
  // getTools() is the source of truth when it answers. When it throws — an agent browser
  // with a half-working API — falling back to rule() keeps the panel honest rather than
  // leaving it blank; the banner already says the agent surface is degraded.
  let tools = null;
  if (hasWebMCP && !reg.degraded) {
    try { tools = await modelContext.getTools(); }
    catch (err) { console.error('[mace] getTools() failed; rendering from the state machine:', err); }
  }
  if (tools) {
    names = tools.map(t => t.name).sort();
    tools.forEach(t => annotations.set(t.name, t.annotations ?? {}));
  } else {
    names = [...legalTools(getState()), ...ALWAYS_ON_READS.map(r => r.toolName)].sort();
  }
  if (token !== renderSeq) return;      // a newer render is already authoritative

  const host = document.createDocumentFragment();
  for (const name of names) {
    const row = ROWS.get(name);
    const item = el('li', 'tool');
    const head = el('div', 'tool-head');
    head.append(el('span', 'tool-name', name));
    const s = ronrFor(name);
    if (s) head.append(el('span', 'ronr', s));

    const a = annotations.get(name) ?? {};
    if (a.readOnlyHint) head.append(el('span', 'badge badge-read', 'readOnly'));
    if (a.untrustedContentHint) head.append(el('span', 'badge badge-untrusted', 'untrusted'));
    if (!hasWebMCP && row?.untrusted) head.append(el('span', 'badge badge-untrusted', 'untrusted'));

    item.append(head);
    item.append(el('div', 'tool-title', row?.title ?? name));

    const btn = el('button', 'do', '▷ do this');
    btn.onclick = () => openRunner(name, row);
    item.append(btn);
    host.append(item);
  }

  $('in-order').replaceChildren(host);   // one atomic swap, after the API answered
  $('in-order-count').textContent = String(names.length);
  settleWithoutEvents(names.length);
}

/**
 * THE PANEL MUST NOT LIE, INCLUDING IN A CLIENT WITH NO toolchange.
 *
 * Declarative tools are adopted by the browser from the DOM — it reads the `toolname`
 * attribute off the <form> — not by a call we can await. Where toolchange fires that is
 * invisible: the event announces the moment the surface settles, and the panel redraws.
 * Without the event, the render that follows a state change can read getTools() a tick
 * before the browser has picked the form up, and the count sticks one low. Measured in
 * the ChatGPT-shaped client at the widest frontier: panel 16, getTools() 17, still wrong
 * four seconds later. That is precisely the divergence this product claims is impossible,
 * so it cannot be left in a client we know about.
 *
 * With no event to wait for, we poll until the surface stops moving. Bounded to ~600ms
 * and entered only when toolchange is unavailable — a client that fires it never gets here.
 */
let toolEventsLive = false;
let settleTimer = null;
function settleWithoutEvents(rendered) {
  if (toolEventsLive || !hasWebMCP || reg.degraded) return;
  clearTimeout(settleTimer);
  let tries = 0;
  const tick = async () => {
    if (toolEventsLive || ++tries > 12) return;
    let n;
    try { n = (await modelContext.getTools()).length; } catch { return; }
    if (n !== rendered) { renderInOrder(); return; }   // that render re-arms the poll
    settleTimer = setTimeout(tick, 50);
  };
  settleTimer = setTimeout(tick, 50);
}

// ── right column: rule(), with the citation that blocks each act ────────────
function renderOutOfOrder() {
  const host = $('out-of-order');
  host.replaceChildren();
  const blocked = outOfOrder(getState());
  for (const f of blocked) {
    const item = el('li', 'tool tool-blocked');
    const head = el('div', 'tool-head');
    head.append(el('span', 'tool-name', f.toolName));
    if (f.ronr) head.append(el('span', 'ronr', f.ronr));
    item.append(head);
    item.append(el('div', 'why', f.reason));
    host.append(item);
  }
  $('out-of-order-count').textContent = String(blocked.length);
}

// ── the ledger: three claims collapsed into one number a judge reads ────────
function renderLedger() {
  const parts = [`toolchange ×${ledger.count}`];
  if (ledger.added.length || ledger.removed.length) {
    parts.push(`+${ledger.added.length} −${ledger.removed.length}`);
  }
  if (ledger.at) parts.push(ledger.at);
  parts.push(`${ledger.total} tools in order`);
  $('ledger').textContent = parts.join('  ·  ');

  const diff = $('ledger-diff');
  diff.replaceChildren();
  ledger.added.forEach(n => diff.append(el('span', 'd-add', `+${n}`)));
  ledger.removed.forEach(n => diff.append(el('span', 'd-rem', `−${n}`)));
}

// ── the bench ───────────────────────────────────────────────────────────────
function renderBench() {
  const s = getState();
  $('phase').textContent = s.phase.replace(/_/g, ' ').toLowerCase();
  $('phase').dataset.phase = s.phase;
  $('present').textContent = String(s.present);
  $('quorum-state').textContent = s.present >= s.quorum ? 'quorum present' : 'QUORUM ABSENT (§40)';
  $('quorum-state').classList.toggle('absent', s.present < s.quorum);

  const stack = $('stack');
  stack.replaceChildren();
  if (!s.stack.length) {
    stack.append(el('li', 'empty', 'The floor is clear.'));
  } else {
    s.stack.forEach((it, i) => {
      const last = i === s.stack.length - 1;
      const li = el('li', `frame${last ? ' pending' : ''}`);
      li.style.marginLeft = `${i * 14}px`;
      const h = el('div', 'frame-head');
      h.append(el('span', 'frame-motion', MOTIONS[it.motion]?.title ?? it.motion));
      h.append(el('span', 'ronr', MOTIONS[it.motion]?.ronr ?? ''));
      if (MOTIONS[it.motion]?.attested === 'simplified') h.append(el('span', 'badge badge-simplified', 'simplified'));
      li.append(h);
      li.append(el('div', 'frame-text', `"${it.text}"`));
      li.append(el('div', 'frame-meta',
        `moved by ${it.mover ?? '—'}${it.seconder ? ` · seconded by ${it.seconder}` : ' · AWAITING A SECOND'}${last ? ' · immediately pending' : ''}`));
      stack.append(li);
    });
  }

  const table = $('table-list');
  table.replaceChildren();
  if (!s.table.length) table.append(el('li', 'empty', 'Nothing on the table.'));
  else s.table.forEach(t => table.append(el('li', 'tabled', `${t.id} — "${t.series[0]?.text ?? ''}"`)));

  // The chair's two reserved acts. Labelled bench controls, logged by name —
  // mace reserves to a human every act that puts words before the assembly.
  $('put-question').disabled = !(s.phase === 'OPEN' && s.stack[s.stack.length - 1]?.seconder);

  $('minutes').textContent = draftMinutes(getEvents(), s);
}

// ── "▷ do this" — a mini-form generated from the tool's own inputSchema ─────
function openRunner(name, row) {
  const dlg = $('runner');
  const form = $('runner-form');
  form.replaceChildren();
  $('runner-title').textContent = row?.title ?? name;
  $('runner-desc').textContent = row?.agentDescription ?? '';
  $('runner-out').textContent = '';

  const schema = row?.paramSchema ?? { properties: {} };
  const props = Object.entries(schema.properties ?? {});
  const state = getState();

  for (const [key, p] of props) {
    const required = schema.required?.includes(key) ?? false;
    const wrap = el('label', 'field');
    wrap.append(el('span', 'field-name', key + (required ? ' *' : '')));
    wrap.append(el('span', 'field-desc', p.description ?? ''));
    let input;
    if (p.enum || p.enumFromTable) {
      input = el('select');
      const opts = p.enum ?? state.table.map(t => t.id);
      opts.forEach(o => { const op = el('option', null, o); op.value = o; input.append(op); });
    } else if (p.type === 'integer') {
      input = el('input'); input.type = 'number'; input.min = String(p.minimum ?? 0);
      if (key === 'present') input.value = String(state.present);
    } else {
      input = el('input'); input.type = 'text';
      if (key === 'mover' || key === 'seconder' || key === 'raisedBy' || key === 'ruledBy' || key === 'chair') {
        input.setAttribute('list', 'members');
      }
    }
    input.name = key;
    // The tool's own validate() throws a sentence that tells the agent how to
    // retry — but Chrome collapses a throw from inside execute() into "Failed to
    // parse input arguments", so a human who submits this dialog with a required
    // field empty saw nothing useful. Marking the field required stops the submit
    // in the browser, before executeTool is ever reached.
    if (required) input.required = true;
    wrap.append(input);
    form.append(wrap);
  }
  if (!props.length) form.append(el('p', 'field-desc', 'This tool takes no parameters.'));

  form.dataset.tool = name;
  dlg.showModal();
}

/**
 * enter_motion_text carries no toolautosubmit on purpose: executeTool fills the
 * clerk's form and focuses it, and the call stays pending until a HUMAN clicks
 * "State the question". That is the product's argument — but an output box left
 * reading "running…" forever looks like a hang, so the dialog says what it is
 * waiting for.
 */
function awaitsAHuman(name) {
  const row = ROWS.get(name);
  if (row?.kind !== 'declarative') return false;
  const form = document.querySelector(`form[toolname="${name}"]`);
  return !!form && !form.hasAttribute('toolautosubmit');
}

async function runFromDialog(e) {
  e.preventDefault();
  const form = $('runner-form');
  const name = form.dataset.tool;
  const data = Object.fromEntries(new FormData(form).entries());
  const out = $('runner-out');

  pathCtl = new AbortController();
  $('runner-stop').hidden = name !== 'explain_path_to';
  out.textContent = awaitsAHuman(name)
    ? 'running… this tool carries no toolautosubmit: it fills the clerk\'s form and focuses it, and the call stays pending until a human clicks "State the question" on the bench.'
    : 'running…';
  try {
    const res = await runTool(name, data, { signal: pathCtl.signal });
    out.textContent = res;
  } catch (err) {
    out.textContent = String(err.message ?? err);
  } finally {
    $('runner-stop').hidden = true;
    pathCtl = null;
  }
}

// ── boot ────────────────────────────────────────────────────────────────────
async function renderAll() {
  await renderInOrder();
  renderOutOfOrder();
  renderLedger();
  renderBench();
}

export async function boot() {
  // The members datalist, so every name field offers the actual roster.
  const dl = $('members');
  MEMBERS.forEach(m => { const o = el('option'); o.value = m; dl.append(o); });

  onChange(() => { renderAll(); });

  // start() must not be able to take the bench down with it. There is a third state
  // beyond live/absent: an agent browser where document.modelContext EXISTS but
  // registration fails. Observed 2026-08-30 in the Codex browser — the banner sat on
  // its "checking for WebMCP…" placeholder and every checkpoint button was dead,
  // because this await threw and the wiring below never ran. A page that looks like it
  // is still loading, forever, is the worst of the three outcomes: it does not work AND
  // it does not admit it. The rule this product is built on — never pretend the API is
  // there when it is not — has to hold when the API is there but broken, too.
  let info = null, startFailed = null;
  try {
    info = await start();
  } catch (err) {
    startFailed = err;
    console.error('[mace] tool registration failed; the bench stays usable:', err);
  }

  // THE PANEL IS THE TOOLCHANGE LISTENER. Not a listener the panel happens to
  // have — the event is what drives the product's main surface.
  //
  // But subscribing is a SEPARATE capability from registering, and hasWebMCP only
  // proves `registerTool` exists. ChatGPT's in-app browser (observed 2026-08-30 on
  // GPT-5.6) hands back a modelContext that registers tools and answers getTools(),
  // yet is not an EventTarget — addEventListener is undefined, so this line threw a
  // TypeError *after* the UI had already painted. The page looked alive and then
  // announced it had failed to start, which is the most misleading outcome available.
  //
  // Degrading here costs the proof, not the product: onChange() above already
  // re-renders on every commit, because the state machine is the source of truth and
  // the tool surface is derived from it. toolchange is how we demonstrate the surface
  // is live; without it the panel still reads its counts from getTools().
  const regErr = startFailed ?? info?.registrationError ?? null;
  if (hasWebMCP && !regErr) {
    try {
      modelContext.addEventListener('toolchange', () => { renderAll(); });
      toolEventsLive = true;
    } catch (err) {
      console.error('[mace] modelContext is not an EventTarget; the panel will re-render from state instead:', err);
    }
  }

  if (hasWebMCP && !regErr && toolEventsLive) {
    $('mcp-state').textContent = `WebMCP live · ${info.contextSource}`;
    $('mcp-state').classList.add('ok');
  } else if (hasWebMCP && !regErr) {
    $('mcp-state').textContent = `WebMCP live · ${info.contextSource} — tools registered, but this client's modelContext is not an EventTarget, so there are no toolchange events. The panel still reads its counts from getTools(); it re-renders on state changes instead of on the event.`;
    $('mcp-state').classList.add('degraded');
  } else if (regErr) {
    $('mcp-state').textContent = `WebMCP present but tool registration failed (${regErr.name || 'Error'}) — this panel is rendering from the state machine instead. Every count below is still real; the agent surface is not.`;
    $('mcp-state').classList.add('degraded');
  } else {
    $('mcp-state').textContent = 'WebMCP not detected — this panel is rendering from the state machine. With WebMCP it renders from document.modelContext.getTools().';
    $('mcp-state').classList.add('degraded');
  }

  // ── the chair's reserved bench acts ──────────────────────────────────────
  $('put-question').onclick = () => commit('put_the_question', {}, 'chair');
  $('attendance').onsubmit = (e) => {
    e.preventDefault();
    const n = Number(new FormData(e.target).get('present'));
    const note = String(new FormData(e.target).get('note') ?? '');
    commit('set_members_present', { present: n, note }, 'chair');
  };

  $('runner-form').onsubmit = runFromDialog;
  $('runner-stop').onclick = () => pathCtl?.abort();
  $('runner-close').onclick = () => $('runner').close();

  $('reset').onclick = () => replayLog([]);
  $('load-tangle').onclick = () => replayLog(SEED.slice(0, CHECKPOINTS.TANGLE));
  $('load-widest').onclick = () => replayLog(SEED.slice(0, CHECKPOINTS.WIDEST));

  await renderAll();
}
