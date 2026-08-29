<p align="center">
  <img src="docs/assets/readme-hero-animated.svg" alt="mace — the second amendment lands: move_to_amend_the_amendment leaves green getTools(); record_vote_tally stays struck red — §12 — never refused." width="100%">
</p>

<p align="center">
  <img src="docs/assets/icon.svg" alt="the mace mark — a stack of motion frames standing on the table, beside one struck-out tool" width="96">
</p>

<!-- favicon set (docs/assets/): the primary mark holds from 48px up; below that a dedicated
     small mark carries the one idea that must survive — negation, a struck-out tool.
       favicon-16.png ← icon-16.svg   (16×16, true-size raster)
       favicon-32.png ← icon-32.svg   (32×32, true-size raster)
       favicon-48.png ← icon.svg      (48×48, true-size raster)
     index.html should link:
       <link rel="icon" href="docs/assets/favicon-32.png" sizes="32x32">
       <link rel="icon" href="docs/assets/favicon-16.png" sizes="16x16">
       <link rel="icon" href="docs/assets/favicon-48.png" sizes="48x48"> -->

<h1 align="center">mace</h1>

<p align="center"><b>The tool list is the agenda.</b></p>

<p align="center">
A clerk's bench for running a deliberative meeting under Robert's Rules of Order —<br>
where the registered WebMCP tool set <em>is</em> the motion stack.
</p>

<p align="center">
  <a href="https://pointoforder.netlify.app"><b>Live&nbsp;→&nbsp;pointoforder.netlify.app</b></a>
</p>

<p align="center">
  <code>WebMCP</code> · <code>document.modelContext</code> · <code>AbortSignal</code> · <code>RONR 12th ed.</code> · <code>zero dependencies</code>
</p>

---

## The mechanism

In Westminster procedure the mace must be on the table or the House cannot legally conduct
business. No mace, no valid business. Here: **no tool, not in order.**

- **The registered tool set is a live state surface.** mace registers exactly the motions that
  are procedurally in order right now — so `document.modelContext.getTools()` literally answers
  *"what is in order now."*
- **An out-of-order action does not exist to be called.** The current WebMCP spec has no
  `unregisterTool()`; a registration is removed by aborting its `AbortSignal`. When a
  second-degree amendment is immediately pending, `record_vote_tally` is not refused — it is
  absent from the agent's tool list, with the blocking rule (§12) shown beside the absence.
- **Legality is enforced at the schema level, not by runtime rejection.** The agent never gets
  the chance to attempt an illegal act; the rule engine decides what exists, and the page's
  legality panel — *"What is in order now"* — renders the same `getTools()` return the agent
  sees.

## Status

Under construction for **The WebMCP Challenge** (OpenAI × Devpost) — submission
September 3, 2026. The application code lands in this repository as it is built; claims,
numbers, and demo materials are added only once they are real and reproducible here.

## License

[MIT](LICENSE)
