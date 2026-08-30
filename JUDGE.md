# mace — for the judge

The web version of this page is **<https://mace.edycu.dev/judge.html>** — no signup, no keys,
no clone. This file mirrors it so it is also readable from the repo.

---

## 1. The claim

> **mace is a clerk's bench for a meeting under Robert's Rules where the registered WebMCP tool
> set _is_ the motion stack — an action that is out of order does not exist to be called.**

Most agent apps hand over every tool and reject the illegal calls at runtime. mace removes the
tool instead. The panel **“What is in order now”** renders its left column directly from
`document.modelContext.getTools()` — the API's own return value — so the screen and the API
cannot disagree.

## 2. The 30-second path

> **Use Chrome 149+ with WebMCP enabled.** The banner top-right must read
> `WebMCP live · document.modelContext`. If it reads “not detected”, the panel falls back to
> the internal state machine and says so — the product never pretends the API is there when it
> is not.

1. Open **<https://pointoforder.netlify.app>**. The count beside **In order** reads **5**.
2. Click **Widest frontier** → **17**. Click **The tangle** → **15**.
3. At the tangle, find `move_to_amend_the_amendment`. It is not greyed out and not refused —
   it is **absent**, and the right column prints the rule that removed it: **§12**, a
   first-degree amendment must be the immediately pending question before it can itself be
   amended.
4. Type **4** into **Members in the room** and press **Record attendance**. Quorum is 5, so
   **17 → 9** on a single integer. The phase never moves; the whole agenda does (**§40**).
5. Open the console and check the panel is not lying:
   `(await document.modelContext.getTools()).length` — it equals the badge, at every checkpoint.

## 3. The receipts

Measured against the live deploy in Chrome 151.0.7922.171. Not estimated.

| What | Value | Where it comes from |
|---|---|---|
| `getTools()` at the four checkpoints | **5 / 17 / 15 / 9** | identical to the on-screen count; zero divergence |
| Tools registered in total | **23** | 4 always-on reads + 17 gated imperative + 2 gated declarative |
| Rule rows behind them | **19** | `src/ronr.data.js` — one factory, no per-tool code |
| Tests | **306** | `npx vitest run` |
| Legality cells asserted | **152** | 7 phases × 19 gated tools, plus a 19-cell sub-quorum sweep |
| Quorum cliff removal | **8** | 7 by aborting the registration `AbortSignal`, 1 by dropping a `toolname` attribute |
| `explain_path_to` search | **depth 6 · 399 nodes** | AND-OR over vote outcomes; completes in a few ms (the screen prints the exact figure) |
| Runtime dependencies | **0** | no framework, no bundler, no transpile |

## 4. Reproduce it

The real path — the same suite CI runs on every push:

```bash
# 306 tests, no network, no keys
git clone https://github.com/edycutjong/mace.git && cd mace
npm install
npx vitest run
```

To run the bench locally, serve it statically — there is no build step:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

A local copy needs Chrome's WebMCP flag rather than the origin-trial token: the token is bound
to `pointoforder.netlify.app` and will not activate on `localhost`.

## 5. What this has not proved

Recorded because the honest absence is worth more than a tick.

- **Zero external users.** No practitioner has run a meeting through this. Nothing in the
  submission claims adoption, and none of the numbers above are usage numbers.
- **The ChatGPT in-app browser fires no `toolchange`.** It is otherwise verified: on
  2026-08-30 (GPT-5.6) tools registered, `getTools()` answered, and the agent executed
  `set_members_present` through `executeTool` — the page went from `PRESENT 0 · QUORUM
  ABSENT (§40)` to `PRESENT 7 · quorum present`. But that client's `modelContext` is not
  an `EventTarget`, so `addEventListener('toolchange')` throws and the event never
  arrives; the panel polls `getTools()` until the surface settles instead. Chrome 151
  remains the only client where the event path itself is exercised.
- **No benchmark suite.** The search figures are single live measurements against the deploy,
  described as such — not p50/p95 over repeated runs.
- **Germaneness is never ruled on.** Not computable from a table, so the chair rules and the
  ruling enters the minutes. That limit is the design, not a gap — and it means mace cannot
  claim to enforce all of Robert's Rules.
- **No small-board mode (§49).** RONR relaxes procedure for boards under about twelve members —
  no need to be recognized, unlimited debate, informal voting, the chair participating. mace
  models the full rules only. An HOA board member pointed this out when I asked r/HOA how
  procedure works in practice, and they were right: most HOA boards qualify for §49, so mace is
  stricter than the rulebook requires for exactly the audience it names. Fixing it is a second
  data file, not a rewrite — the rulebook is already pure data — but it is not written.
- **The meeting is seeded.** A fictional HOA board log. It is not a dressed screen — every
  checkpoint replays through the same `reduce()` the live bench uses, and you can drive it
  forward yourself from any of them.

## 6. Links

| | |
|---|---|
| Live bench | <https://pointoforder.netlify.app> |
| Source · MIT | <https://github.com/edycutjong/mace> |
| Overview | <https://mace.edycu.dev> |
| Pitch deck | <https://mace.edycu.dev/deck.html> |

Judging has not taken place and no placement is claimed.
