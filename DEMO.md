# Demo & Benchmarks

## The 30-second demo

Open **<https://pointoforder.netlify.app>** in Chrome 149+ with WebMCP enabled, then:

> **Click *Widest frontier*. Change “Members in the room” from 7 to 4. Press *Record attendance*.**

Quorum is 5. **Seventeen tools become nine**, the `Out of order` column fills with rows each
citing **§40**, and the phase never moves. Seven of the eight leave by aborting the
`AbortSignal` they were registered with; one — `enter_motion_text` — leaves because its
`<form>` lost its `toolname` attribute. Two different removal mechanisms, one state change.

Nothing was refused. The tools stopped existing.

## Real run — receipt

Run: `npm run bench` · **2026-08-30T09:00:02Z** · against the live production origin.

| | |
|---|---|
| Client | Chrome **151.0.7922.171**, WebMCP origin trial active |
| Host | Apple M1 Max · macOS 26.5.2 |
| Target | `https://pointoforder.netlify.app` — the deployed origin, not localhost |
| Wall clock | **7.8 s** end-to-end |
| Provider spend | **$0.00** |
| Correctness gates | **9 / 9 PASS** (exits non-zero on any failure) |

**Provider spend is $0.00 because there are no providers.** mace has no backend, makes no model
calls at runtime, and ships zero runtime dependencies — the legality engine is a state machine
over a hand-written table of RONR citations. There is no API bill to publish, and saying so is
more useful than an empty receipt.

## Headline number

> **90 comparisons of `document.modelContext.getTools()` against the number on screen.
> 0 divergences.**

That is the claim worth measuring. mace is not asserting it is fast — it is asserting the panel
**cannot** lie, because its left column is rendered from `getTools()` itself rather than from
our own bookkeeping. If the API's answer and the screen ever disagreed, the product would be
broken. Ninety samples across three checkpoints, on the live origin: they never did.

Latency is reported below, but it is a supporting number, not the claim.

## Reproduce

```bash
git clone https://github.com/edycutjong/mace && cd mace
npm install
npm run bench          # real run against the live origin, ~8s
```

No keys, no `.env`, no flags. It drives the deployed origin in real Chrome and **exits non-zero
if any gate fails.** Override with `BENCH_URL=` or `BENCH_TRIALS=` if you want to point it
elsewhere or run longer.

CI / deterministic replay: `npx vitest run` — 306 unit tests including all 152 legality cells,
100% statement/branch/function/line coverage on the seven pure modules (`npm run coverage`).
That suite proves the *rules*; the bench above proves the *deployed product*.

## Full results

n = 30 trials per scenario after 5 discarded warm-ups. Timings are `performance.now()` measured
inside the page, so they exclude Playwright's own round trip.

| Scenario | p50 | p95 | max | n |
|---|---|---|---|---|
| `getTools()` round trip | 0.20 ms | 0.30 ms | 0.40 ms | 90 |
| Quorum cliff — submit → surface settled | 1.40 ms | 4.20 ms | 4.30 ms | 30 |
| `explain_path_to` — AND-OR search | 1.10 ms | 1.40 ms | 1.50 ms | 30 |

Correctness gates, all asserted per run:

| Gate | Value |
|---|---|
| `getTools()` at load / widest / the tangle | 5 / 17 / 15 |
| Quorum cliff removes exactly | 8 tools |
| …of which declarative (`toolname` dropped) | exactly 1 |
| `explain_path_to` proves complete to | depth 6 |
| …exploring exactly | 399 nodes |
| `getTools()` vs on-screen count | **0 divergences of 90** |

The cliff is measured to *settlement*, not to a timer we picked: the loop polls `getTools()`
until the API itself reports the new surface.

## Methodology & limitations

- **Seed data is `src/seed.js`, checked in** — one fictional Maple Ridge HOA board meeting.
  It is an operator-seeded demo dataset and is labelled as such. It is **not** a dressed screen:
  every checkpoint replays that log through the same `reduce()` the live bench uses, so each is
  a state the engine actually reached.
- **Single machine, single client.** All numbers are one M1 Max on Chrome 151. No cross-device,
  cross-browser or cold-network distribution is claimed.
- **Sub-millisecond timings are near the clock's resolution.** `performance.now()` is coarsened
  by the browser; treat the `getTools()` p50 of 0.20 ms as "below measurement noise", not as a
  precise figure.
- **The search timing varies run to run** (0.5–13 ms observed across sessions). Depth 6 and 399
  nodes are stable and gated; the millisecond figure is not, which is why no single ms value
  appears on any judged surface.
- **Not measured:** the ChatGPT in-app browser. Every number here is Chrome 151. That client is
  unverified, and nothing in this file should be read as covering it.
- **Not measured:** concurrent users, memory, or long-session behaviour. mace is a single-page
  static app with no server, so there is no throughput dimension to report.
